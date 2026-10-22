require "test_helper"

class PeriodableTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @read_key = ApiKey.create!(
      user: @user,
      name: "Period Read Key",
      scopes: [ "read" ],
      display_key: "test_period_ro_#{SecureRandom.hex(8)}",
      source: "mobile"
    )

    @start_date = 15.days.ago.to_date
    @end_date = 5.days.ago.to_date
  end

  test "start_date and end_date params build a custom period" do
    get "/api/v1/home",
      params: { start_date: @start_date.iso8601, end_date: @end_date.iso8601 },
      headers: api_headers(@read_key)

    assert_response :success
    assert_period_dates @start_date, @end_date
  end

  test "invalid start_date or end_date falls back to last 30 days" do
    [
      { start_date: "not-a-date", end_date: @end_date.iso8601 },
      { start_date: @start_date.iso8601, end_date: "not-a-date" }
    ].each do |params|
      get "/api/v1/home", params: params, headers: api_headers(@read_key)

      assert_response :success
      assert_period_dates 30.days.ago.to_date, Date.current
    end
  end

  test "start_date and end_date range where start is after end falls back to last 30 days" do
    get "/api/v1/home",
      params: { start_date: @end_date.iso8601, end_date: @start_date.iso8601 },
      headers: api_headers(@read_key)

    assert_response :success
    assert_period_dates 30.days.ago.to_date, Date.current
  end

  test "start_date without end_date is ignored and the user's default period wins" do
    @user.update!(default_period: "last_7_days")

    get "/api/v1/home", params: { start_date: @start_date.iso8601 }, headers: api_headers(@read_key)

    assert_response :success
    assert_period_dates 7.days.ago.to_date, Date.current
  end

  test "start_date and end_date do not persist as the user's default period" do
    @user.update!(default_period: "last_7_days")

    get "/api/v1/home",
      params: { start_date: @start_date.iso8601, end_date: @end_date.iso8601 },
      headers: api_headers(@read_key)

    assert_response :success
    assert_period_dates @start_date, @end_date

    assert_equal "last_7_days", @user.reload.default_period
  end

  test "start_date and end_date take precedence over a period param" do
    get "/api/v1/home",
      params: { period: "last_7_days", start_date: @start_date.iso8601, end_date: @end_date.iso8601 },
      headers: api_headers(@read_key)

    assert_response :success
    assert_period_dates @start_date, @end_date
  end

  private
    def assert_period_dates(start_date, end_date)
      period = response.parsed_body.fetch("period")
      assert_equal start_date.iso8601, period.fetch("start_date")
      assert_equal end_date.iso8601, period.fetch("end_date")
    end
end
