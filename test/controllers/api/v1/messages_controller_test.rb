# frozen_string_literal: true

require "test_helper"

class Api::V1::MessagesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @user.update!(ai_enabled: true)
    @user.api_keys.destroy_all
    User.any_instance.stubs(:ai_available?).returns(true)
    Chat.stubs(:default_model).returns("default-model")
    BackgroundJobHealth.stubs(:snapshot).returns({})
    BackgroundJobHealth.stubs(:summary).returns("Worker unavailable")
    @read_key = create_key("read")
    @write_key = create_key("read_write")
    @chat = chats(:one)
  end

  test "requires authentication for send retry and timeout reporting" do
    post "/api/v1/chats/#{@chat.id}/messages"
    assert_response :unauthorized
    post "/api/v1/chats/#{@chat.id}/messages/retry"
    assert_response :unauthorized
    post "/api/v1/chats/#{@chat.id}/messages/#{messages(:chat1_assistant_response).id}/report_timeout"
    assert_response :unauthorized
  end

  test "requires AI consent for every mutation" do
    @user.update!(ai_enabled: false)
    post "/api/v1/chats/#{@chat.id}/messages", params: { content: "Hello" }, headers: api_headers(@write_key), as: :json
    assert_response :forbidden
    post "/api/v1/chats/#{@chat.id}/messages/retry", headers: api_headers(@write_key)
    assert_response :forbidden
    post "/api/v1/chats/#{@chat.id}/messages/#{messages(:chat1_assistant_response).id}/report_timeout", headers: api_headers(@write_key)
    assert_response :forbidden
  end

  test "canonical content and model create one user turn and enqueue exactly one assistant response" do
    assert_enqueued_jobs 1, only: AssistantResponseJob do
      assert_difference "UserMessage.count", 1 do
        post "/api/v1/chats/#{@chat.id}/messages",
          params: { content: "Test message", model: "selected-model" }, headers: api_headers(@write_key), as: :json
      end
    end
    assert_response :created
    body = response.parsed_body
    assert_equal "Test message", body["content"]
    assert_equal "user_message", body["type"]
    assert_equal "selected-model", body["model"]
    assert_equal "selected-model", @chat.messages.find(body["id"]).ai_model
    assert_equal false, body["pending"]
    assert_equal false, body["reasoning"]
    assert_equal "pending", body["ai_response_status"]
  end

  test "blank model uses the configured default" do
    post "/api/v1/chats/#{@chat.id}/messages", params: { content: "Hello", model: "" }, headers: api_headers(@write_key), as: :json
    assert_response :created
    assert_equal "default-model", @chat.messages.find(response.parsed_body["id"]).ai_model
  end

  test "blank content returns validation details and enqueues no assistant response" do
    assert_no_enqueued_jobs only: AssistantResponseJob do
      assert_no_difference "Message.count" do
        post "/api/v1/chats/#{@chat.id}/messages", params: { content: "" }, headers: api_headers(@write_key), as: :json
      end
    end
    assert_response :unprocessable_entity
    assert response.parsed_body["details"].present?
  end

  test "retries a failed unanswered user turn with its original model and clears the error" do
    @chat.messages.where(type: "AssistantMessage").destroy_all
    @chat.update!(error: "Provider failed")
    assert_enqueued_jobs 1, only: AssistantResponseJob do
      post "/api/v1/chats/#{@chat.id}/messages/retry", headers: api_headers(@write_key)
    end
    assert_response :accepted
    pending = @chat.messages.find(response.parsed_body["message_id"])
    assert pending.pending?
    assert_equal messages(:chat1_user).ai_model, pending.ai_model
    assert_nil @chat.reload.error
  end

  test "a chat deleted while saving a message returns not found" do
    UserMessage.any_instance.stubs(:save).raises(ActiveRecord::InvalidForeignKey)
    post "/api/v1/chats/#{@chat.id}/messages", params: { content: "Hello" }, headers: api_headers(@write_key), as: :json
    assert_response :not_found
  end

  test "canonical retry can regenerate the last completed assistant response" do
    assert_enqueued_jobs 1, only: AssistantResponseJob do
      post "/api/v1/chats/#{@chat.id}/messages/retry", headers: api_headers(@write_key)
    end
    assert_response :accepted
    assert @chat.messages.find(response.parsed_body["message_id"]).pending?
  end

  test "repeated retry while a response is pending does not enqueue another response" do
    @chat.messages.create!(type: "AssistantMessage", content: "", ai_model: "test-model", status: :pending)
    assert_no_enqueued_jobs only: AssistantResponseJob do
      post "/api/v1/chats/#{@chat.id}/messages/retry", headers: api_headers(@write_key)
    end
    assert_response :unprocessable_entity
  end

  test "retry of an empty conversation returns a semantic error" do
    @chat.messages.destroy_all
    post "/api/v1/chats/#{@chat.id}/messages/retry", headers: api_headers(@write_key)
    assert_response :unprocessable_entity
  end

  test "early timeout is declined and preserves the live response" do
    pending = create_pending(created_at: Time.current)
    post timeout_path(pending), headers: api_headers(@write_key)
    assert_response :conflict
    assert pending.reload.pending?
    assert_nil @chat.reload.error
  end

  test "server-aged timeout removes the undelivered bubble and records a friendly retryable error" do
    @chat.messages.where(type: "AssistantMessage").destroy_all
    pending = create_pending(created_at: (Chat.undelivered_response_timeout + 1.second).ago)
    post timeout_path(pending), headers: api_headers(@write_key)
    assert_response :no_content
    assert_not Message.exists?(pending.id)
    assert_equal I18n.t("chat.errors.no_response"), @chat.reload.presentable_error_message
    assert @chat.needs_assistant_response?

    post timeout_path(pending), headers: api_headers(@write_key)
    assert_response :not_found
    assert_equal I18n.t("chat.errors.no_response"), @chat.reload.presentable_error_message
  end

  test "partial timeout excludes failed assistant text and retry uses the preceding user turn" do
    @chat.messages.where(type: "AssistantMessage").destroy_all
    pending = create_pending(created_at: (Chat.undelivered_response_timeout + 1.second).ago, content: "Partial response")
    post timeout_path(pending), headers: api_headers(@write_key)
    assert_response :no_content
    assert pending.reload.failed?
    assert_not_includes @chat.conversation_messages.pluck(:id), pending.id
    assert_enqueued_jobs 1, only: AssistantResponseJob do
      post "/api/v1/chats/#{@chat.id}/messages/retry", headers: api_headers(@write_key)
    end
    assert_response :accepted
    assert @chat.messages.find(response.parsed_body["message_id"]).pending?
  end

  test "completed and user messages cannot be timed out" do
    [ messages(:chat1_user), messages(:chat1_assistant_response) ].each do |message|
      post timeout_path(message), headers: api_headers(@write_key)
      assert_response :conflict
      assert Message.exists?(message.id)
    end
    assert_nil @chat.reload.error
  end

  test "read-only keys cannot send retry or report a timeout" do
    pending = create_pending(created_at: 1.hour.ago)
    post "/api/v1/chats/#{@chat.id}/messages", params: { content: "No" }, headers: api_headers(@read_key), as: :json
    assert_response :forbidden
    post "/api/v1/chats/#{@chat.id}/messages/retry", headers: api_headers(@read_key)
    assert_response :forbidden
    post timeout_path(pending), headers: api_headers(@read_key)
    assert_response :forbidden
    assert pending.reload.pending?
  end

  test "chat and message lookup remain scoped to the credential owner" do
    other_chat = chats(:two)
    post "/api/v1/chats/#{other_chat.id}/messages", params: { content: "No" }, headers: api_headers(@write_key), as: :json
    assert_response :not_found
    post "/api/v1/chats/#{other_chat.id}/messages/retry", headers: api_headers(@write_key)
    assert_response :not_found
    other_pending = other_chat.messages.create!(type: "AssistantMessage", content: "", ai_model: "test-model", status: :pending, created_at: 1.hour.ago)
    post "/api/v1/chats/#{@chat.id}/messages/#{other_pending.id}/report_timeout", headers: api_headers(@write_key)
    assert_response :not_found
    post "/api/v1/chats/#{other_chat.id}/messages/#{other_pending.id}/report_timeout", headers: api_headers(@write_key)
    assert_response :not_found
    assert other_pending.reload.pending?
  end

  test "browser sessions can send messages through the canonical endpoint" do
    sign_in @user
    post "/api/v1/chats/#{@chat.id}/messages", params: { content: "Browser message" }, as: :json
    assert_response :created
    assert_equal "Browser message", response.parsed_body["content"]
  end

  private

    def create_key(scope)
      ApiKey.create!(user: @user, name: "Messages #{scope}", key: ApiKey.generate_secure_key, scopes: [ scope ], source: "web")
    end

    def api_headers(key)
      { "X-Api-Key" => key.display_key }
    end

    def create_pending(created_at:, content: "")
      @chat.messages.create!(type: "AssistantMessage", content: content, ai_model: "test-model", status: :pending, created_at: created_at)
    end

    def timeout_path(message)
      "/api/v1/chats/#{@chat.id}/messages/#{message.id}/report_timeout"
    end
end
