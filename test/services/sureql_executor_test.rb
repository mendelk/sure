require "test_helper"

class SureqlExecutorTest < ActiveSupport::TestCase
  setup do
    @user = users(:family_admin)
  end

  test "executes transactions query and caps limit at 50" do
    result = Sureql::Executor.new(@user).call("from transactions\ntake 5")

    assert_includes result.sql, "FROM"
    assert_includes result.sql, "entries"
    assert_includes result.sql, "LIMIT"
    assert_equal "transactions", result.source_key
    assert result.columns.present?
    assert_equal result.rows.size, result.row_count
    assert result.row_count <= 5
    assert_not result.truncated
  end

  test "clamps large take to MAX_ROWS and flags truncated" do
    result = Sureql::Executor.new(@user).call("from transactions\ntake 1000")

    assert_match(/LIMIT 50/i, result.sql)
    assert result.row_count <= Sureql::Executor::MAX_ROWS
    assert result.truncated
  end

  test "appends limit when query has none" do
    result = Sureql::Executor.new(@user).call("from accounts")

    assert_match(/LIMIT 50/i, result.sql)
    assert_equal "accounts", result.source_key
  end

  test "only returns rows in accessible accounts" do
    result = Sureql::Executor.new(@user).call("from transactions\ntake 10")

    accessible_ids = Account.accessible_by(@user).pluck(:id)
    assert result.columns.include?("account_id")
    result.rows.each do |row|
      assert_includes accessible_ids, row["account_id"]
    end
  end

  test "rejects unknown source" do
    assert_raises(Sureql::UnknownSourceError) do
      Sureql::Executor.new(@user).call("from secrets")
    end
  end
end
