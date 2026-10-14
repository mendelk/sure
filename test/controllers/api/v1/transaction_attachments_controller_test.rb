# frozen_string_literal: true

require "test_helper"

class Api::V1::TransactionAttachmentsControllerTest < ActionDispatch::IntegrationTest
  include EntriesTestHelper

  setup do
    @user = users(:family_admin)
    @family = @user.family
    @account = accounts(:depository)
    @entry = create_transaction(amount: 100, name: "Store purchase", account: @account)
    @transaction = @entry.entryable

    @user.api_keys.active.destroy_all
    @api_key = ApiKey.create!(
      user: @user,
      name: "Attachments Key",
      scopes: [ "read_write" ],
      source: "web",
      display_key: "attach_rw_#{SecureRandom.hex(8)}"
    )
    @read_only_api_key = ApiKey.create!(
      user: @user,
      name: "Attachments Read Key",
      scopes: [ "read" ],
      source: "mobile",
      display_key: "attach_ro_#{SecureRandom.hex(8)}"
    )
  end

  def pdf_upload(filename: "receipt.pdf")
    tempfile = Tempfile.new([ "receipt", ".pdf" ])
    tempfile.binmode
    tempfile.write("%PDF-1.4 test")
    tempfile.rewind
    Rack::Test::UploadedFile.new(tempfile.path, "application/pdf", true, original_filename: filename)
  end

  test "index lists attachments" do
    @transaction.attachments.attach(pdf_upload)

    get api_v1_transaction_attachments_url(@transaction), headers: api_headers(@read_only_api_key)
    assert_response :success

    body = JSON.parse(response.body)
    assert_equal 1, body["attachments"].length
    assert_equal "receipt.pdf", body["attachments"].first["filename"]
    assert_equal "application/pdf", body["attachments"].first["content_type"]
  end

  test "create uploads attachment" do
    assert_difference -> { @transaction.attachments.count } => 1 do
      post api_v1_transaction_attachments_url(@transaction),
        params: { attachments: [ pdf_upload ] },
        headers: api_headers(@api_key)
    end

    assert_response :created
    assert_equal "receipt.pdf", JSON.parse(response.body)["attachments"].first["filename"]
  end

  test "create rejects over-limit uploads" do
    Transaction::MAX_ATTACHMENTS_PER_TRANSACTION.times do |index|
      @transaction.attachments.attach(pdf_upload(filename: "receipt-#{index}.pdf"))
    end

    post api_v1_transaction_attachments_url(@transaction),
      params: { attachments: [ pdf_upload(filename: "second.pdf") ] },
      headers: api_headers(@api_key)
    assert_response :unprocessable_entity
  end

  test "create requires write scope" do
    post api_v1_transaction_attachments_url(@transaction),
      params: { attachments: [ pdf_upload ] },
      headers: api_headers(@read_only_api_key)
    assert_response :forbidden
  end

  test "destroy purges attachment" do
    @transaction.attachments.attach(pdf_upload)
    attachment = @transaction.attachments.first

    assert_difference -> { @transaction.attachments.count } => -1 do
      delete api_v1_transaction_attachment_url(@transaction, attachment),
        headers: api_headers(@api_key)
    end

    assert_response :success
  end

  test "destroy requires write scope" do
    @transaction.attachments.attach(pdf_upload)
    attachment = @transaction.attachments.first

    delete api_v1_transaction_attachment_url(@transaction, attachment),
      headers: api_headers(@read_only_api_key)
    assert_response :forbidden
  end

  test "show redirects to blob" do
    @transaction.attachments.attach(pdf_upload)
    attachment = @transaction.attachments.first

    get api_v1_transaction_attachment_url(@transaction, attachment),
      headers: api_headers(@read_only_api_key)
    assert_response :redirect
  end
end
