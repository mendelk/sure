# frozen_string_literal: true

require "test_helper"

class Api::V1::ChatsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @user.update!(ai_enabled: true)
    @user.api_keys.destroy_all
    User.any_instance.stubs(:ai_available?).returns(true)
    Chat.stubs(:default_model).returns("test-model")
    BackgroundJobHealth.stubs(:healthy?).returns(true)
    @read_key = create_key(@user, "read")
    @write_key = create_key(@user, "read_write")
    @chat = chats(:one)
  end

  test "reading a chat never mutates the last-viewed preference" do
    @user.update!(last_viewed_chat: nil)
    get "/api/v1/chats/#{@chat.id}", params: { include: "workspace" }, headers: api_headers(@read_key)
    assert_response :success
    assert_nil @user.reload.last_viewed_chat_id
  end

  test "explicit viewing records only an owned chat with write scope" do
    @user.update!(last_viewed_chat: nil)
    patch "/api/v1/chats/#{@chat.id}/view"
    assert_response :unauthorized
    patch "/api/v1/chats/#{@chat.id}/view", headers: api_headers(@read_key)
    assert_response :forbidden
    assert_nil @user.reload.last_viewed_chat_id
    patch "/api/v1/chats/#{chats(:two).id}/view", headers: api_headers(@write_key)
    assert_response :not_found
    assert_nil @user.reload.last_viewed_chat_id
    patch "/api/v1/chats/#{@chat.id}/view", headers: api_headers(@write_key)
    assert_response :no_content
    assert_equal @chat.id, @user.reload.last_viewed_chat_id
  end

  test "view preference requires AI consent" do
    @user.update!(ai_enabled: false, last_viewed_chat: nil)
    patch "/api/v1/chats/#{@chat.id}/view", headers: api_headers(@write_key)
    assert_response :forbidden
    assert_nil @user.reload.last_viewed_chat_id
  end

  test "browser view preference requires CSRF and accepts a valid token" do
    @user.update!(last_viewed_chat: nil)
    sign_in @user
    original = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    begin
      patch "/api/v1/chats/#{@chat.id}/view", as: :json
      assert_response :unprocessable_content
      assert_nil @user.reload.last_viewed_chat_id

      get "/chats"
      assert_response :success
      token = css_select('meta[name="csrf-token"]').first["content"]
      patch "/api/v1/chats/#{@chat.id}/view", headers: { "X-CSRF-Token" => token }, as: :json
      assert_response :no_content
      assert_equal @chat.id, @user.reload.last_viewed_chat_id
    ensure
      ActionController::Base.allow_forgery_protection = original
    end
  end

  test "requires authentication for chats and form metadata" do
    get "/api/v1/chats", params: { include: "workspace" }
    assert_response :unauthorized
    get "/api/v1/chats/form_options"
    assert_response :unauthorized
  end

  test "canonical clients retain paginated resources without workspace negotiation" do
    get "/api/v1/chats", headers: api_headers(@read_key)
    assert_response :success
    assert response.parsed_body["pagination"].present?
    assert_not response.parsed_body.key?("workspace")
    summary = response.parsed_body["chats"].find { |chat| chat["id"] == @chat.id }
    assert_equal @chat.messages.count, summary["message_count"]

    get "/api/v1/chats/#{@chat.id}", headers: api_headers(@read_key)
    assert_response :success
    assert_equal @chat.id, response.parsed_body["id"]
    assert response.parsed_body["messages"].present?
    assert_not response.parsed_body.key?("workspace")
  end

  test "base list and detail require AI to be enabled" do
    @user.update!(ai_enabled: false)
    get "/api/v1/chats", headers: api_headers(@read_key)
    assert_response :forbidden
    assert_equal "feature_disabled", response.parsed_body["error"]
    get "/api/v1/chats/#{@chat.id}", params: { include: "workspace" }, headers: api_headers(@read_key)
    assert_response :forbidden
  end

  test "workspace supports consent without exposing chat history while AI is disabled" do
    @user.update!(ai_enabled: false)
    get "/api/v1/chats", params: { include: "workspace" }, headers: api_headers(@read_key)
    assert_response :success
    body = response.parsed_body
    assert_empty body["chats"]
    assert_empty body.dig("workspace", "chats")
    assert_equal false, body.dig("workspace", "ai_enabled")
    assert_equal true, body.dig("workspace", "ai_available")
  end

  test "form metadata exposes configured defaults and timeout before AI consent" do
    @user.update!(ai_enabled: false)
    with_env_overrides AI_RESPONSE_TIMEOUT: "240" do
      get "/api/v1/chats/form_options", headers: api_headers(@read_key)
      assert_response :success
      body = response.parsed_body
      assert_nil body.dig("chat", "id")
      assert body.dig("chat", "title").present?
      assert_equal "test-model", body["default_model"]
      assert_equal 240_000, body["response_timeout_ms"]
      assert_equal false, body["ai_enabled"]
    end
  end

  test "base list remains paginated while workspace contains the complete owner list" do
    22.times { |index| @user.chats.create!(title: "Conversation #{index}") }
    get "/api/v1/chats", params: { include: "workspace" }, headers: api_headers(@read_key)
    assert_response :success
    body = response.parsed_body
    assert_equal 20, body["chats"].length
    assert_equal @user.chats.count, body.dig("workspace", "chats").length
    assert_not_includes body.dig("workspace", "chats").pluck("id"), chats(:two).id
    assert_equal @chat.messages.count, body.dig("workspace", "chats").find { |chat| chat["id"] == @chat.id }["message_count"]
    assert body["pagination"].present?
  end

  test "workspace detail includes full conversation and pending state beyond the canonical first page" do
    51.times do |index|
      @chat.messages.create!(type: "AssistantMessage", content: "Response #{index}", ai_model: "test-model")
    end
    pending = @chat.messages.create!(type: "AssistantMessage", content: "", ai_model: "selected-model", status: :pending)
    failed = @chat.messages.create!(type: "AssistantMessage", content: "Partial failed response", ai_model: "test-model", status: :failed)
    get "/api/v1/chats/#{@chat.id}", params: { include: "workspace" }, headers: api_headers(@read_key)
    assert_response :success
    body = response.parsed_body
    messages = body.dig("workspace", "messages")
    assert_operator body.dig("pagination", "total_pages"), :>, 1
    assert_equal @chat.messages.count, body.dig("pagination", "total_count")
    assert_operator body["messages"].length, :<, messages.length
    assert_not_includes body["messages"].pluck("id"), pending.id
    assert_equal @chat.conversation_messages.count, messages.length
    assert_not_includes messages.pluck("id"), failed.id
    assert_equal true, messages.find { |message| message["id"] == pending.id }["pending"]
    assert_equal "selected-model", messages.find { |message| message["id"] == pending.id }["model"]
    assert_equal @chat.id, body["id"]
  end

  test "workspace hides technical errors and tool payloads unless debug mode is enabled" do
    @chat.update!(error: { message: "Friendly error", technical_message: "secret provider detail" }.to_json)
    assistant = messages(:chat1_assistant_response)
    tool_call = assistant.tool_calls.create!(
      type: "ToolCall::Function", provider_id: "test-call", function_name: "get_accounts",
      function_arguments: {}, function_result: { account: "private detail" }
    )
    with_env_overrides AI_DEBUG_MODE: "false" do
      get "/api/v1/chats/#{@chat.id}", params: { include: "workspace" }, headers: api_headers(@read_key)
      assert_response :success
      body = response.parsed_body
      assert_equal "Friendly error", body["error"]
      assert_nil body.dig("workspace", "technical_error")
      assert_equal false, body.dig("workspace", "needs_response")
      assert_empty body.dig("workspace", "messages").find { |message| message["id"] == assistant.id }["tool_calls"]
      assert_includes body["messages"].find { |message| message["id"] == assistant.id }["tool_calls"].pluck("id"), tool_call.id
    end
    with_env_overrides AI_DEBUG_MODE: "true" do
      get "/api/v1/chats/#{@chat.id}", params: { include: "workspace" }, headers: api_headers(@read_key)
      assert_response :success
      assert_equal "secret provider detail", response.parsed_body.dig("workspace", "technical_error")
      assert_includes response.parsed_body.dig("workspace", "messages").find { |message| message["id"] == assistant.id }["tool_calls"].pluck("id"), tool_call.id
    end
  end

  test "creates initial conversation using canonical message and model fields and one response job" do
    assert_enqueued_jobs 1, only: AssistantResponseJob do
      assert_difference "Chat.count", 1 do
        post "/api/v1/chats?include=workspace", params: { message: "Help me budget", model: "chosen-model" },
          headers: api_headers(@write_key), as: :json
      end
    end
    assert_response :created
    body = response.parsed_body
    assert_equal "Help me budget", body["title"]
    chat = @user.chats.find(body["id"])
    assert_equal chat.id, @user.reload.last_viewed_chat_id
    assert_equal "chosen-model", chat.messages.find_by!(type: "UserMessage").ai_model
    assert_equal 2, body.dig("workspace", "messages").length
    assert_equal true, body.dig("workspace", "messages").last["pending"]
  end

  test "canonical title-only creation and empty conversation detail remain valid" do
    post "/api/v1/chats?include=workspace", params: { title: "Empty conversation" }, headers: api_headers(@write_key), as: :json
    assert_response :created
    assert_equal "Empty conversation", response.parsed_body["title"]
    assert_empty response.parsed_body["messages"]
    assert_equal false, response.parsed_body.dig("workspace", "needs_response")
  end

  test "rejects invalid chats without persisting an initial message" do
    assert_no_difference [ "Chat.count", "Message.count" ] do
      post "/api/v1/chats", params: { title: "", message: "Hello" }, headers: api_headers(@write_key), as: :json
    end
    assert_response :unprocessable_entity
    assert response.parsed_body["details"].present?
  end

  test "updates title using canonical root and returns workspace detail" do
    patch "/api/v1/chats/#{@chat.id}?include=workspace", params: { title: "Updated title" }, headers: api_headers(@write_key), as: :json
    assert_response :success
    assert_equal "Updated title", @chat.reload.title
    assert response.parsed_body.dig("workspace", "messages").present?
    patch "/api/v1/chats/#{@chat.id}", params: { title: "" }, headers: api_headers(@write_key), as: :json
    assert_response :unprocessable_entity
    assert_equal "Updated title", @chat.reload.title
  end

  test "deleting the last viewed chat clears its viewer reference" do
    @user.update!(last_viewed_chat: @chat)
    assert_difference "Chat.count", -1 do
      delete "/api/v1/chats/#{@chat.id}", headers: api_headers(@write_key)
    end
    assert_response :no_content
    assert_nil @user.reload.last_viewed_chat_id
  end

  test "read keys cannot create update or destroy chats" do
    post "/api/v1/chats", params: { title: "Forbidden" }, headers: api_headers(@read_key), as: :json
    assert_response :forbidden
    patch "/api/v1/chats/#{@chat.id}", params: { title: "Forbidden" }, headers: api_headers(@read_key), as: :json
    assert_response :forbidden
    delete "/api/v1/chats/#{@chat.id}", headers: api_headers(@read_key)
    assert_response :forbidden
  end

  test "another user's chat is inaccessible even in the same family" do
    other_chat = chats(:two)
    get "/api/v1/chats/#{other_chat.id}", params: { include: "workspace" }, headers: api_headers(@read_key)
    assert_response :not_found
    patch "/api/v1/chats/#{other_chat.id}", params: { title: "Forbidden" }, headers: api_headers(@write_key), as: :json
    assert_response :not_found
    delete "/api/v1/chats/#{other_chat.id}", headers: api_headers(@write_key)
    assert_response :not_found
  end

  test "browser session loads the same workspace representation" do
    sign_in @user
    get "/api/v1/chats", params: { include: "workspace" }
    assert_response :success
    assert_includes response.parsed_body.dig("workspace", "chats").pluck("id"), @chat.id
  end

  test "API key authentication does not inherit browser impersonation" do
    support_user = users(:sure_support_staff)
    support_user.update!(ai_enabled: true)
    support_user.api_keys.destroy_all
    support_chat = support_user.chats.create!(title: "Support Chat")
    key = create_key(support_user, "read")
    impersonation = impersonation_sessions(:in_progress)
    impersonated_chat = impersonation.impersonated.chats.create!(title: "Impersonated Chat")
    sign_in support_user
    Current.session.update!(active_impersonator_session: impersonation)

    get "/api/v1/chats", params: { include: "workspace" }, headers: api_headers(key)
    assert_response :success
    ids = response.parsed_body.dig("workspace", "chats").pluck("id")
    assert_includes ids, support_chat.id
    assert_not_includes ids, impersonated_chat.id
  end

  private

    def create_key(user, scope)
      ApiKey.create!(user: user, name: "Chat #{scope}", key: ApiKey.generate_secure_key, scopes: [ scope ], source: "web")
    end

    def api_headers(key)
      { "X-Api-Key" => key.display_key }
    end
end
