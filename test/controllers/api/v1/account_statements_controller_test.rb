# frozen_string_literal: true

require "test_helper"

class Api::V1::AccountStatementsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @family = @user.family
    @account = accounts(:depository)
    @user.api_keys.active.destroy_all
    @api_key = create_key(@user, "read_write", "web")
    @read_key = create_key(@user, "read", "mobile")
  end

  test "requires authentication" do
    get api_v1_account_statements_path
    assert_response :unauthorized
  end

  test "lists canonical resources and additive workspace with either key or session" do
    statement = create_statement
    get api_v1_account_statements_path, params: { include: "workspace" }, headers: api_headers(@read_key)
    assert_response :success
    assert_includes response.parsed_body["account_statements"].map { |item| item["id"] }, statement.id
    assert_equal 1, response.parsed_body.dig("pagination", "total_count")
    assert_equal "/api/v1/account_statements", response.parsed_body.dig("workspace", "upload", "href")
    assert_includes response.parsed_body.dig("workspace", "linked", "items").map { |item| item["id"] }, statement.id

    sign_in @user
    get api_v1_account_statement_path(statement), params: { include: "workspace" }
    assert_response :success
    assert_equal statement.id, response.parsed_body.dig("account_statement", "id")
    assert response.parsed_body.dig("workspace", "can_manage")
  end

  test "real multipart uploads store binary attachments without importing ledger entries" do
    content = "date,amount\n2024-01-01,12\n"
    assert_difference "AccountStatement.count", 1 do
      assert_no_difference [ "Import.count", "Entry.count", "Transaction.count" ] do
        upload([ uploaded_file(filename: "bank.csv", content_type: "text/csv", content: content) ], account: @account)
      end
    end
    assert_response :created
    statement = @family.account_statements.find(response.parsed_body["account_statements"].first["id"])
    assert_equal @account, statement.account
    assert_equal content, statement.original_file.download
    assert_equal "linked", statement.review_status
  end

  test "uploads to unmatched inbox and deduplicates identical bytes" do
    upload([ uploaded_file(filename: "inbox.csv", content_type: "text/csv") ])
    assert_response :created
    statement_id = response.parsed_body["account_statements"].first["id"]
    assert_nil @family.account_statements.find(statement_id).account_id
    assert_no_difference "AccountStatement.count" do
      upload([ uploaded_file(filename: "renamed.csv", content_type: "text/csv") ])
    end
    assert_response :success
    assert_equal 1, response.parsed_body["duplicate_count"]
    assert_equal statement_id, response.parsed_body["duplicates"].first["id"]
  end

  test "partial upload failures preserve successful files and report errors" do
    upload([
      uploaded_file(filename: "bad.exe", content_type: "application/octet-stream", content: "bad"),
      uploaded_file(filename: "good.csv", content_type: "text/csv")
    ])
    assert_response :created
    assert_equal 1, response.parsed_body["account_statements"].size
    assert_equal [ I18n.t("account_statements.create.invalid_file_type") ], response.parsed_body["errors"]
  end

  test "missing empty spoofed and oversized files return validation errors" do
    [ [],
      [ uploaded_file(filename: "empty.csv", content_type: "text/csv", content: "") ],
      [ uploaded_file(filename: "spoofed.pdf", content_type: "application/pdf", content: "not a PDF") ]
    ].each do |files|
      assert_no_difference "AccountStatement.count" do
        upload(files)
      end
      assert_response :unprocessable_entity
    end

    original_limit = AccountStatement::MAX_FILE_SIZE
    silence_warnings { AccountStatement.const_set(:MAX_FILE_SIZE, 16) }
    assert_no_difference "AccountStatement.count" do
      upload([ uploaded_file(filename: "large.csv", content_type: "text/csv", content: "x" * 17) ])
    end
    assert_response :unprocessable_entity
  ensure
    silence_warnings { AccountStatement.const_set(:MAX_FILE_SIZE, original_limit) } if original_limit
  end

  test "read only keys cannot mutate any statement operation" do
    statement = create_statement
    post api_v1_account_statements_path, params: { account_statement: { files: [] } }, headers: api_headers(@read_key)
    assert_response :forbidden
    patch api_v1_account_statement_path(statement), params: { account_statement: { currency: "USD" } }, headers: api_headers(@read_key)
    assert_response :forbidden
    [ :link, :unlink, :reject ].each do |action|
      patch "/api/v1/account_statements/#{statement.id}/#{action}", headers: api_headers(@read_key)
      assert_response :forbidden
    end
    delete api_v1_account_statement_path(statement), headers: api_headers(@read_key)
    assert_response :forbidden
  end

  test "metadata updates preserve domain normalization reconciliation and date validation" do
    statement = create_statement
    patch api_v1_account_statement_path(statement), params: { account_statement: {
      institution_name_hint: "My bank", period_start_on: "2024-01-01", period_end_on: "2024-01-31", closing_balance: "123.45", currency: "usd"
    } }, headers: api_headers(@api_key), as: :json
    assert_response :success
    assert_equal "USD", statement.reload.currency
    assert_equal BigDecimal("123.45"), statement.closing_balance
    assert_equal "2024-01-31", response.parsed_body.dig("account_statement", "period_end_on")

    [ { period_start_on: "2024-02-31" }, { period_end_on: "2023-12-31" }, { currency: "not-a-currency" } ].each do |attrs|
      patch api_v1_account_statement_path(statement), params: { account_statement: attrs }, headers: api_headers(@api_key), as: :json
      assert_response :unprocessable_entity
    end
    assert_equal Date.new(2024, 1, 31), statement.reload.period_end_on
  end

  test "metadata account links distinguish absent null and selected account" do
    statement = create_statement
    patch api_v1_account_statement_path(statement), params: { account_statement: { institution_name_hint: "Renamed" } }, headers: api_headers(@api_key), as: :json
    assert_response :success
    assert_equal @account.id, statement.reload.account_id
    patch api_v1_account_statement_path(statement), params: { account_statement: { account_id: nil } }, headers: api_headers(@api_key), as: :json
    assert_response :success
    assert_nil statement.reload.account_id
    patch api_v1_account_statement_path(statement), params: { account_statement: { account_id: @account.id } }, headers: api_headers(@api_key), as: :json
    assert_response :success
    assert_equal @account.id, statement.reload.account_id
    assert statement.linked?
  end

  test "unknown statement identifiers and malformed account filters are not found" do
    get api_v1_account_statement_path(SecureRandom.uuid), headers: api_headers(@api_key)
    assert_response :not_found
    get api_v1_account_statements_path, params: { account_id: "not-a-uuid" }, headers: api_headers(@api_key)
    assert_response :not_found
  end

  test "link unlink reject and delete use vault statuses" do
    statement = create_statement(account: nil)
    statement.update!(suggested_account: @account, match_confidence: 0.9)
    patch link_api_v1_account_statement_path(statement), headers: api_headers(@api_key)
    assert_response :success
    assert_equal @account, statement.reload.account
    assert statement.linked?

    patch unlink_api_v1_account_statement_path(statement), headers: api_headers(@api_key)
    assert_response :success
    assert_nil statement.reload.account_id
    assert statement.unmatched?

    patch reject_api_v1_account_statement_path(statement), headers: api_headers(@api_key)
    assert_response :success
    assert statement.reload.rejected?
    assert_nil statement.suggested_account_id

    assert_difference "AccountStatement.count", -1 do
      delete api_v1_account_statement_path(statement), headers: api_headers(@api_key)
    end
    assert_response :no_content
  end

  test "link without target returns validation failure" do
    statement = create_statement(account: nil)
    statement.update!(suggested_account: nil)
    patch link_api_v1_account_statement_path(statement), headers: api_headers(@api_key)
    assert_response :unprocessable_entity
  end

  test "API key alone streams original bytes directly without a browser session or redirect" do
    content = "date,description,amount\r\n2024-01-01,Café purchase,12.50\r\n"
    statement = AccountStatement.create_from_upload!(
      family: @family, account: @account,
      file: uploaded_file(filename: "original.csv", content_type: "text/csv", content: content)
    )
    reset!
    get download_api_v1_account_statement_path(statement),
      headers: api_headers(@read_key).merge("Accept" => "application/json")

    assert_response :success
    assert_empty request.cookies
    assert_equal content.b, response.body.b
    assert_equal statement.original_file.blob.content_type_for_serving, response.media_type
    assert_match(/\Aattachment;/, response.headers["Content-Disposition"])
    assert_includes response.headers["Content-Disposition"], "original.csv"
    assert_nil response.headers["Location"]
  end

  test "browser session downloads use the same direct binary response" do
    statement = create_statement
    content = statement.original_file.download
    sign_in @user
    get download_api_v1_account_statement_path(statement), headers: { "Accept" => "application/json" }

    assert_response :success
    assert_equal content.b, response.body.b
    assert_equal statement.original_file.blob.content_type_for_serving, response.media_type
    assert_match(/\Aattachment;/, response.headers["Content-Disposition"])
    assert_nil response.headers["Location"]
  end

  test "read only account access permits reads and downloads but never source or target mutations" do
    member = users(:family_member)
    key = create_key(member, "read_write", "web")
    statement = create_statement(account: accounts(:credit_card))
    get api_v1_account_statement_path(statement), headers: api_headers(key)
    assert_response :success
    refute response.parsed_body.dig("account_statement", "can_manage")
    get download_api_v1_account_statement_path(statement), headers: api_headers(key)
    assert_response :success
    assert_equal statement.original_file.download.b, response.body.b
    assert_equal statement.original_file.blob.content_type_for_serving, response.media_type
    assert_match(/\Aattachment;/, response.headers["Content-Disposition"])
    assert_nil response.headers["Location"]
    patch link_api_v1_account_statement_path(statement), params: { account_id: @account.id }, headers: api_headers(key)
    assert_response :forbidden
    patch api_v1_account_statement_path(statement), params: { account_statement: { account_id: @account.id } }, headers: api_headers(key)
    assert_response :forbidden
    delete api_v1_account_statement_path(statement), headers: api_headers(key)
    assert_response :forbidden
    upload([ uploaded_file(filename: "no.csv", content_type: "text/csv") ], account: accounts(:credit_card), key: key)
    assert_response :forbidden
    unmatched = create_statement(account: nil)
    patch link_api_v1_account_statement_path(unmatched), params: { account_id: accounts(:credit_card).id }, headers: api_headers(key)
    assert_response :forbidden
  end

  test "private account documents and suggestions are not exposed" do
    private_statement = create_statement(account: accounts(:other_asset))
    unmatched = create_statement(account: nil)
    unmatched.update!(suggested_account: accounts(:other_asset), match_confidence: 0.99)
    key = create_key(users(:family_member), "read_write", "web")
    get api_v1_account_statements_path, params: { include: "workspace" }, headers: api_headers(key)
    assert_response :success
    refute_includes response.body, private_statement.id
    refute_includes response.body, accounts(:other_asset).id
    get api_v1_account_statement_path(private_statement), headers: api_headers(key)
    assert_response :not_found
    get download_api_v1_account_statement_path(private_statement), headers: api_headers(key)
    assert_response :not_found

    assert_no_difference "AccountStatement.count" do
      upload([ uploaded_file(filename: "renamed.csv", content_type: "text/csv", content: private_statement.original_file.download) ], key: key)
    end
    assert_response :unprocessable_entity
    assert_equal 0, response.parsed_body["duplicate_count"]
    assert_empty response.parsed_body["duplicates"]
    assert_equal [ "Statement file is unavailable." ], response.parsed_body["errors"]
    refute_includes response.body, private_statement.id
    refute_includes response.body, accounts(:other_asset).id
    refute_includes response.body, private_statement.filename

    assert_difference "AccountStatement.count", 1 do
      upload([
        uploaded_file(filename: "renamed.csv", content_type: "text/csv", content: private_statement.original_file.download),
        uploaded_file(filename: "new.csv", content_type: "text/csv", content: "date,amount\n2024-02-01,987654321\n")
      ], key: key)
    end
    assert_response :created
    assert_equal 1, response.parsed_body["account_statements"].size
    assert_equal 0, response.parsed_body["duplicate_count"]
    assert_empty response.parsed_body["duplicates"]
    assert_equal [ "Statement file is unavailable." ], response.parsed_body["errors"]
  end

  test "cross family accounts and statements return not found" do
    outsider = users(:family_admin).dup
    outsider.email = "statement-outsider@example.com"
    outsider.family = families(:empty)
    outsider.password = "password123"
    outsider.save!
    foreign_account = outsider.family.accounts.create!(name: "Private", currency: "USD", balance: 0, accountable: Depository.new, owner: outsider)
    foreign_statement = create_statement(account: foreign_account, family: outsider.family)
    get api_v1_account_statement_path(foreign_statement), headers: api_headers(@api_key)
    assert_response :not_found
    get coverage_api_v1_account_statements_path, params: { account_id: foreign_account.id }, headers: api_headers(@api_key)
    assert_response :not_found
    upload([ uploaded_file(filename: "cross.csv", content_type: "text/csv") ], account: foreign_account)
    assert_response :not_found
  end

  test "coverage reports document presence separately from reconciliation and rejects bad year" do
    statement = create_statement
    statement.update!(period_start_on: "2024-01-01", period_end_on: "2024-01-31", opening_balance: nil, closing_balance: nil)
    get coverage_api_v1_account_statements_path, params: { account_id: @account.id, year: 2024 }, headers: api_headers(@read_key)
    assert_response :success
    january = response.parsed_body["months"].find { |month| month["month"] == "2024-01" }
    assert_equal "covered", january["status"]
    assert_equal "unavailable", january["reconciliation_status"]
    assert_includes january["statement_ids"], statement.id
    assert_equal 12, response.parsed_body["months"].length
    get coverage_api_v1_account_statements_path, params: { account_id: @account.id, year: "nonsense" }, headers: api_headers(@api_key)
    assert_response :unprocessable_entity
  end

  test "guests cannot use vault index or coverage or unmatched details" do
    guest_key = create_key(family_guest, "read_write", "web")
    statement = create_statement(account: nil)
    get api_v1_account_statements_path, headers: api_headers(guest_key)
    assert_response :forbidden
    get coverage_api_v1_account_statements_path, params: { account_id: @account.id }, headers: api_headers(guest_key)
    assert_response :forbidden
    get api_v1_account_statement_path(statement), headers: api_headers(guest_key)
    assert_response :not_found
  end

  test "session upload enforces CSRF and accepts the browser token" do
    ensure_tailwind_build
    sign_in @user
    original = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    post api_v1_account_statements_path, params: { account_statement: { files: [ uploaded_file(filename: "blocked.csv", content_type: "text/csv") ] } }
    assert_response :unprocessable_entity
    get account_statements_path
    token = Nokogiri::HTML(response.body).at_css('meta[name="csrf-token"]')["content"]
    assert_difference "AccountStatement.count", 1 do
      post api_v1_account_statements_path, params: { account_statement: { files: [ uploaded_file(filename: "allowed.csv", content_type: "text/csv") ] } }, headers: { "X-CSRF-Token" => token }
    end
    assert_response :created
  ensure
    ActionController::Base.allow_forgery_protection = original
  end

  private
    def create_key(user, scope, source)
      user.api_keys.where(source: source).active.destroy_all
      ApiKey.create!(user: user, name: "Statements #{scope}", scopes: [ scope ], source: source, display_key: "statements_#{SecureRandom.hex(12)}")
    end

    def api_headers(key)
      { "X-Api-Key" => key.display_key }
    end

    def upload(files, account: nil, key: @api_key)
      post api_v1_account_statements_path, params: { account_statement: { files: files, account_id: account&.id } }, headers: api_headers(key)
    end

    def create_statement(account: @account, family: @family)
      AccountStatement.create_from_upload!(family: family, account: account, file: uploaded_file(
        filename: "statement_#{SecureRandom.hex(4)}.csv", content_type: "text/csv", content: "date,amount\n2024-01-01,#{SecureRandom.random_number(1_000_000)}\n"
      ))
    end
end
