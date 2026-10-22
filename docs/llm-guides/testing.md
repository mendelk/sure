# Testing

Use Rails Minitest and fixtures for behavioral tests; do not introduce RSpec
behavioral tests or factories. RSpec/rswag is the explicit exception for
[OpenAPI documentation only](api-endpoint-consistency.md).

- Mirror `app/` under `test/` and name files `*_test.rb`.
- Keep fixtures small: normally two or three per model representing base cases.
  Create edge cases within the test that needs them. Use Rails helpers for large
  data sets, such as [`EntriesTestHelper`](../../test/support/entries_test_helper.rb).
- Write tests while implementing critical behavior. Prefer unit tests plus focused
  integration tests; use system tests sparingly for critical user flows.
- Test code paths that significantly increase confidence. Do not add tests merely
  to verify ActiveRecord's built-in persistence or duplicate another class's tests.
- Respect class boundaries: verify query outputs and that commands receive the
  correct arguments. Do not inspect another class's internal implementation.
- Use Mocha for stubs/mocks. Prefer `OpenStruct` for mock instances, or a small mock
  class for complex cases. Only mock what the test needs; do not stub return values
  that are irrelevant to the behavior under test.
- Use VCR for external API calls and existing cassettes in `test/vcr_cassettes/`.
  Keep credentials out of recordings; filters and shared setup live in
  [`test/test_helper.rb`](../../test/test_helper.rb).
- Match controller assertions to current route ownership. SPA routes no longer
  render retired ERB drawers or dashboard charts; remove their markup and
  translated-copy assertions. Cover dashboard calculations and period/account
  boundaries through the home API, and check React interactions in the browser.
  Server-rendered layout checks must request an ERB-owned page.
- Provider metadata/date tests must explicitly enable pending imports and clear
  environment overrides with `with_env_overrides`, rather than rely on deployment defaults.
- Separate PostgreSQL sessions in lock tests must use the configured database
  identity: this repository uses `user`, while Rails also accepts `username`.

For example, when testing an orchestrator, set the command expectation before
calling the subject, then check the subject's returned result:

```ruby
test "passes the result to the processor" do
  CustomEventProcessor.expects(:process_result).with(4).once

  assert_equal 4, ExampleClass.new.do_something
end
```

This illustrates a test boundary; it does not prescribe new classes. Follow existing
model/controller tests for real fixtures and API setup.

Use the commands and full [pre-PR checklist](development.md#before-opening-a-pull-request).
API changes also require the [post-commit consistency checklist](api-endpoint-consistency.md).
