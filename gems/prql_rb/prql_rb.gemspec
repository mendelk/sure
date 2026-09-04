require_relative "lib/prql_rb/version"

Gem::Specification.new do |spec|
  spec.name = "prql_rb"
  spec.version = PrqlRb::VERSION
  spec.authors = [ "prql_rb contributors" ]
  spec.summary = "Compile PRQL to SQL using prqlc"
  spec.license = "AGPL-3.0-or-later"
  spec.required_ruby_version = ">= 3.2"

  spec.files = Dir["{bin,ext,lib}/**/*", "LICENSE", "README.md"]
  spec.require_paths = [ "lib" ]
  spec.extensions = [ "ext/prql_rb/extconf.rb" ]

  spec.add_dependency "rb_sys", "~> 0.9"
end
