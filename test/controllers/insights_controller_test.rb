require "test_helper"

class InsightsControllerTest < ActionDispatch::IntegrationTest
  setup do
    sign_in @user = users(:family_admin)
    enable_preview_features
    @insight = insights(:spending_anomaly_dining)
    ensure_tailwind_build
    @read_key = ApiKey.create!(
      user: @user,
      name: "Home Insights Read Key",
      scopes: [ "read" ],
      display_key: "test_home_insights_ro_#{SecureRandom.hex(8)}",
      source: "mobile"
    )
  end

  test "index renders visible insights and marks them read" do
    get insights_url

    assert_response :success
    assert_match CGI.escapeHTML(@insight.title), response.body
    assert @insight.reload.read?
  end

  test "turbo prefetch requests do not mark insights read" do
    get insights_url, headers: { "X-Sec-Purpose" => "prefetch" }

    assert_response :success
    assert @insight.reload.active?
  end

  test "home feed exposes unread state without marking insights read" do
    insights(:cash_flow_warning).mark_read!

    get "/api/v1/home", headers: api_headers(@read_key)

    assert_response :success
    rows = response.parsed_body.fetch("insights").fetch("insights")
    assert_equal "active", rows.find { |row| row.fetch("id") == @insight.id }.fetch("status")
    assert_equal "read", rows.find { |row| row.fetch("id") == insights(:cash_flow_warning).id }.fetch("status")
    assert @insight.reload.active?
  end

  test "insights feed leads the dashboard for users with a saved order that predates it" do
    @user.update!(preferences: (@user.preferences || {}).merge(
      "section_order" => %w[cashflow_sankey outflows_donut net_worth_chart balance_sheet]
    ))

    get "/api/v1/home", headers: api_headers(@read_key)

    assert_response :success
    keys = response.parsed_body.fetch("sections").map { |section| section.fetch("key") }
    assert_equal "insights_feed", keys.first
    assert_operator keys.index("insights_feed"), :<, keys.index("cashflow_sankey")
  end

  # Acknowledging is a quiet action — no undo toast. Acknowledgement only covers
  # the numbers the user saw (see Insight's class comment), so a dismissed
  # insight resurfaces on its own when those numbers move; a toast interrupting
  # every dismissal bought little.
  test "acknowledge clears the insight without an undo toast" do
    patch acknowledge_insight_url(@insight), as: :turbo_stream

    assert_response :success
    assert_match "turbo-stream", response.body
    assert_no_match(/#{Regexp.escape(unacknowledge_insight_path(@insight))}/, response.body)
    assert @insight.reload.acknowledged?
  end

  # The card leaves via a stream, which is silent to a screen reader, and takes
  # the control the user just activated with it. With the toast gone, the shared
  # live region carries that confirmation instead.
  test "acknowledge announces the dismissal in the shared live region" do
    patch acknowledge_insight_url(@insight), as: :turbo_stream

    assert_response :success
    assert_select "turbo-stream[action=update][target=?]", "aria-announcer" do
      assert_match CGI.escapeHTML(I18n.t("insights.card.acknowledged")), response.body
    end
  end

  test "the live region is present before any stream updates it" do
    get insights_url

    assert_response :success
    assert_select "#aria-announcer[role=status][aria-live=polite]", 1,
      "a live region that arrives with its content is not announced"
  end

  # The card used to leave via `turbo_stream.remove`, which emptied
  # #insights-list without re-rendering the partial that owns the empty state —
  # so dismissing the last insight showed a blank page until reload.
  test "acknowledging the last insight renders the empty state" do
    @user.family.insights.where.not(id: @insight.id).destroy_all

    patch acknowledge_insight_url(@insight), as: :turbo_stream

    assert_response :success
    assert_match "insights-list", response.body
    assert_match CGI.escapeHTML(I18n.t("insights.index.empty.title")), response.body
  end

  test "acknowledging the last insight hides the home feed" do
    @user.family.insights.where.not(id: @insight.id).destroy_all

    patch acknowledge_insight_url(@insight), as: :turbo_stream
    assert_response :success

    get "/api/v1/home", headers: api_headers(@read_key)

    assert_response :success
    assert_empty response.parsed_body.fetch("insights").fetch("insights")
    section = response.parsed_body.fetch("sections").find { |item| item.fetch("key") == "insights_feed" }
    assert_equal false, section.fetch("visible")
  end

  test "unacknowledge restores the insight as read and re-renders the list" do
    @insight.acknowledge!

    patch unacknowledge_insight_url(@insight), as: :turbo_stream

    assert_response :success
    assert_match "insights-list", response.body
    assert_match CGI.escapeHTML(@insight.title), response.body
    assert @insight.reload.read?
    assert_nil @insight.dismissed_at
  end

  test "acknowledging a home feed insight promotes the next visible insight" do
    family = @user.family
    family.insights.destroy_all

    # One more than the well holds, same priority so `ordered` falls through to
    # generated_at and the sequence is predictable.
    rows = (Insight::FEED_LIMIT + 1).times.map do |i|
      family.insights.create!(
        insight_type: "idle_cash",
        priority: "high",
        status: "active",
        title: "Test insight #{i}",
        body: "body",
        dedup_key: "idle_cash:test:#{i}",
        generated_at: (i + 1).minutes.ago
      )
    end

    patch acknowledge_insight_url(rows.first), as: :turbo_stream

    assert_response :success

    get "/api/v1/home", headers: api_headers(@read_key)

    assert_response :success
    ids = response.parsed_body.fetch("insights").fetch("insights").map { |row| row.fetch("id") }
    assert_equal rows.drop(1).first(Insight::FEED_LIMIT).map(&:id), ids
    assert rows.first.reload.acknowledged?
  end

  test "refresh swaps the button into a pending state via turbo stream" do
    assert_enqueued_with(job: GenerateInsightsJob, args: [ { family_id: @user.family_id } ]) do
      post refresh_insights_url, as: :turbo_stream
    end

    assert_response :success
    assert_match "insights-refresh", response.body
    assert_match CGI.escapeHTML(I18n.t("insights.refresh.checking")), response.body
  end

  test "cannot acknowledge another family's insight" do
    other_insight = families(:empty).insights.create!(
      insight_type: "idle_cash",
      priority: "low",
      title: "Someone else's insight",
      body: "Body",
      dedup_key: "idle_cash:other:2026-07"
    )

    patch acknowledge_insight_url(other_insight), as: :turbo_stream

    assert_response :not_found
    assert other_insight.reload.active?
  end

  test "refresh enqueues insight generation for the family" do
    assert_enqueued_with(job: GenerateInsightsJob, args: [ { family_id: @user.family_id } ]) do
      post refresh_insights_url
    end

    assert_redirected_to insights_path
  end

  # Preview access belongs to the individual user, even though insights are
  # shared within the family.
  test "redirects users without preview access" do
    disable_preview_features

    get insights_url

    assert_redirected_to root_path
    assert_match(/preview/i, flash[:alert])
  end

  test "refresh does not enqueue generation for users without preview access" do
    disable_preview_features

    assert_no_enqueued_jobs only: GenerateInsightsJob do
      post refresh_insights_url
    end

    assert_redirected_to root_path
  end

  test "acknowledge is blocked for users without preview access" do
    disable_preview_features

    patch acknowledge_insight_url(@insight), as: :turbo_stream

    assert_redirected_to root_path
    assert @insight.reload.active?
  end

  test "home feed stays disabled when only another family member has preview access" do
    disable_preview_features
    member = @user.family.users.where.not(id: @user.id).first
    member.update!(preferences: (member.preferences || {}).merge("preview_features_enabled" => true))

    get "/api/v1/home", headers: api_headers(@read_key)

    assert_response :success
    payload = response.parsed_body
    assert_equal false, payload.fetch("preview")
    assert_equal false, payload.fetch("insights").fetch("enabled")
    assert_empty payload.fetch("insights").fetch("insights")
    assert_not_includes payload.fetch("sections").map { |section| section.fetch("key") }, "insights_feed"
  end

  private
    def enable_preview_features
      @user.update!(preferences: (@user.preferences || {}).merge("preview_features_enabled" => true))
    end

    def disable_preview_features
      @user.update!(preferences: (@user.preferences || {}).merge("preview_features_enabled" => false))
    end
end
