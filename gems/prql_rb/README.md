# prql_rb

`prql_rb` is a small Ruby native-extension wrapper around the Rust
[`prqlc`](https://crates.io/crates/prqlc) compiler.

```ruby
PrqlRb.compile(<<~PRQL)
  from transactions
  filter amount > 100
  select { id, amount }
PRQL
```

The default target is PostgreSQL. Compilation failures raise
`PrqlRb::CompileError` and do not execute any SQL.

## Development

Install Ruby 3.2 or newer and Rust 1.85 or newer, then run:

```sh
bundle install
bundle exec ruby gems/prql_rb/bin/compile
bundle exec rake -f gems/prql_rb/Rakefile
```
