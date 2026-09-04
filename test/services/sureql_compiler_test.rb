require "test_helper"

class SureqlCompilerTest < ActiveSupport::TestCase
  test "expands from to real relation and injects authz filter" do
    compiler = Sureql::Compiler.new(users(:family_admin))

    sql = compiler.call("from transactions\nfilter amount < 0\ntake 5")

    assert_includes sql, "FROM"
    assert_includes sql, "entries"
    assert_includes sql, "WHERE"
    assert_includes sql, "account_id IN"
    accessible_ids = Account.accessible_by(users(:family_admin)).pluck(:id)
    accessible_ids.each { |id| assert_includes sql, id }
  end

  test "accounts source authorizes on its own id" do
    compiler = Sureql::Compiler.new(users(:family_admin))

    sql = compiler.call("from accounts\ntake 2")

    assert_includes sql, "FROM"
    assert_includes sql, "accounts"
    assert_includes sql, "id IN"
  end

  test "rejects sources outside the registry" do
    compiler = Sureql::Compiler.new(users(:family_admin))

    error = assert_raises(Sureql::UnknownSourceError) do
      compiler.call("from secrets")
    end
    assert_match(/unknown sureql source `secrets`/, error.message)
    assert_match(/transactions/, error.message)
  end

  test "rejects pipelines without a from line" do
    compiler = Sureql::Compiler.new(users(:family_admin))

    error = assert_raises(Sureql::CompileError) do
      compiler.call("filter amount < 0")
    end
    assert_match(/requires at least one `from <source>`/, error.message)
  end

  test "wraps prql compile errors" do
    compiler = Sureql::Compiler.new(users(:family_admin))

    assert_raises(Sureql::CompileError) do
      compiler.call("from transactions\nthis is not prql !!")
    end
  end

  test "user with no accessible accounts matches nothing" do
    user = users(:family_admin)
    Account.stubs(:accessible_by).returns(Account.none)

    compiler = Sureql::Compiler.new(user)
    sql = compiler.call("from transactions\ntake 5")

    assert_includes sql, "WHERE"
    assert_includes sql.upcase, "NULL"
  end
end
