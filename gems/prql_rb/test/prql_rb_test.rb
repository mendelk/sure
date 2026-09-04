require "minitest/autorun"
require "prql_rb"

class PrqlRbTest < Minitest::Test
  def test_compiles_prql_to_postgresql
    sql = PrqlRb.compile(<<~PRQL)
      from transactions
      filter amount > 100
      select { id, amount }
    PRQL

    assert_equal <<~SQL, sql
      SELECT
        id,
        amount
      FROM
        transactions
      WHERE
        amount > 100
    SQL
  end

  def test_can_return_unformatted_sql
    sql = PrqlRb.compile("from transactions | take 5", format: false)

    assert_equal "SELECT * FROM transactions LIMIT 5", sql
  end

  def test_raises_a_compile_error_for_invalid_prql
    error = assert_raises(PrqlRb::CompileError) do
      PrqlRb.compile("from")
    end

    assert_match(/expected/, error.message)
  end

  def test_raises_a_compile_error_for_an_unknown_target
    error = assert_raises(PrqlRb::CompileError) do
      PrqlRb.compile("from transactions", target: "sql.unknown")
    end

    assert_match(/unknown/i, error.message)
  end

  def test_exposes_the_compiler_version
    assert_match(/\A\d+\.\d+\.\d+/, PrqlRb.compiler_version)
  end
end
