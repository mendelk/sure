require "test_helper"

class ChatsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @family = families(:dylan_family)
    sign_in @user
  end

  test "gets index" do
    get chats_url
    assert_response :success
    assert_select "#spa-root", count: 1
  end

  test "gets index as json" do
    get chats_url(format: :json)
    assert_response :success
    data = JSON.parse(response.body)
    assert data.key?("chats")
    assert data.key?("ai_enabled")
  end
  test "gets index as turbo frame" do
    get chats_url, headers: { "Turbo-Frame" => "sidebar_chat" }
    assert_response :success
    assert_select "turbo-frame#sidebar_chat", count: 1
  end


  test "gets new chat with a localized German default title" do
    @user.update!(locale: "de")

    travel_to Time.zone.local(2026, 8, 29, 12, 34) do
      get new_chat_url(format: :json)

      assert_response :success
      assert_equal "Neuer Chat 2026-08-29 12:34", JSON.parse(response.body).dig("chat", "title")
    end
  end

  test "gets new chat with the existing English default title" do
    @user.update!(locale: "en")

    travel_to Time.zone.local(2026, 8, 29, 12, 34) do
      get new_chat_url(format: :json)

      assert_response :success
      assert_equal "New chat 2026-08-29 12:34", JSON.parse(response.body).dig("chat", "title")
    end
  end
  test "gets new chat HTML" do
    get new_chat_url
    assert_response :success
    assert_select "#spa-root", count: 1
  end
  test "gets new chat as turbo frame" do
    get new_chat_url, headers: { "Turbo-Frame" => "sidebar_chat" }
    assert_response :success
    assert_select "turbo-frame#sidebar_chat", count: 1
  end


  test "creates chat" do
    assert_difference("Chat.count") do
      post chats_url, params: { chat: { content: "Hello", ai_model: "gpt-4.1" } }
    end

    chat = Chat.order(created_at: :desc).first

    assert_redirected_to chat_path(chat, thinking: true)
    assert_equal "Hello", chat.title
    assert_equal "Hello", chat.messages.find_by!(type: "UserMessage").content
  end

  test "shows chat" do
    chat = chats(:one)
    @user.update!(last_viewed_chat: nil)

    get chat_url(chat)

    assert_response :success
    assert_select "#spa-root", count: 1
    assert_equal chat, @user.reload.last_viewed_chat
  end

  test "shows chat as json" do
    chat = chats(:one)
    get chat_url(chat, format: :json)
    assert_response :success
    data = JSON.parse(response.body)
    assert_equal chat.id, data["id"]
    assert data.key?("messages")
  end

  test "gets edit HTML" do
    chat = chats(:one)
    get edit_chat_url(chat)
    assert_response :success
    assert_select "#spa-root", count: 1
  end

  test "gets edit as json" do
    chat = chats(:one)
    get edit_chat_url(chat, format: :json)
    assert_response :success
    data = JSON.parse(response.body)
    assert_equal chat.id, data.dig("chat", "id")
    assert_equal chat.title, data.dig("chat", "title")
  end

  test "updates chat as json" do
    chat = chats(:one)
    patch chat_url(chat, format: :json), params: { chat: { title: "Updated Title" } }
    assert_response :success
    assert_equal "Updated Title", chat.reload.title
  end

  test "creates chat as json" do
    assert_difference("Chat.count") do
      post chats_url(format: :json), params: { chat: { content: "JSON Hello", ai_model: "gpt-4.1" } }
    end
    assert_response :created
    data = JSON.parse(response.body)
    assert_equal "JSON Hello", data["title"]
  end

  test "destroys chat" do
    assert_difference("Chat.count", -1) do
      delete chat_url(chats(:one))
    end

    assert_redirected_to chats_url
  end

  test "should not allow access to other user's chats" do
    other_user = users(:family_member)
    other_chat = Chat.create!(user: other_user, title: "Other User's Chat")

    get chat_url(other_chat)
    assert_response :not_found

    delete chat_url(other_chat)
    assert_response :not_found
  end
end
