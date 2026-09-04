require_relative "prql_rb/version"
require_relative "prql_rb/prql_rb"

module PrqlRb
  DEFAULT_TARGET = "sql.postgres"

  def self.compile(source, target: DEFAULT_TARGET, format: true, signature_comment: false)
    native_compile(source, target, format, signature_comment)
  end
end
