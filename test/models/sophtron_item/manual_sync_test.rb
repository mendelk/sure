# frozen_string_literal: true

require "test_helper"

class SophtronItem::ManualSyncTest < ActiveSupport::TestCase
  setup do
    @item = families(:dylan_family).sophtron_items.create!(name: "Sophtron", user_id: "developer-user", access_key: Base64.strict_encode64("secret"), customer_id: "customer-1", user_institution_id: "institution-1", manual_sync: true)
    @provider_account = @item.sophtron_accounts.create!(account_id: "remote-1", name: "Checking", currency: "USD", balance: 100)
    AccountProvider.create!(account: accounts(:depository), provider: @provider_account)
    @remote = mock
    @item.stubs(:sophtron_provider).returns(@remote)
    @job = { "JobID" => "job-1", "LastStatus" => "MFA" }
    @item.stubs(:upsert_job_snapshot!)
    @item.stubs(:build_mfa_challenge).returns({ security_questions: [ "Question" ] })
  end

  test "manual sync pauses at MFA without importing unapproved transactions" do
    @remote.expects(:refresh_account).with("remote-1").returns({ "JobID" => "job-1" })
    @remote.expects(:get_job_information).with("job-1").returns(@job)
    Provider::Sophtron.stubs(:job_requires_input?).with(@job).returns(true)
    SophtronItem::Importer.expects(:new).never
    result = SophtronItem::ManualSync.new(@item).start!
    assert_equal "pending", result[:status]
    assert_equal [ "Question" ], result.dig(:challenge, :security_questions)
    assert_equal @provider_account.id, @item.reload.current_job_sophtron_account_id
    assert @item.syncs.find(result[:sync_id]).syncing?
  end

  test "manual sync does not start a second interactive job" do
    @item.update!(current_job_id: "job-1", current_job_sophtron_account_id: @provider_account.id)
    @remote.expects(:refresh_account).never
    assert_no_difference "Sync.count" do
      assert_raises(ProviderConnection::Conflict) { SophtronItem::ManualSync.new(@item).start! }
    end
  end

  test "provider failures mark manual sync failed and return sanitized errors" do
    @remote.expects(:refresh_account).raises(Provider::Sophtron::Error.new("private-token", :api_error))
    error = assert_raises(ProviderConnection::Invalid) { SophtronItem::ManualSync.new(@item).start! }
    refute_includes error.message, "private-token"
    assert @item.syncs.ordered.first.failed?
    assert_nil @item.reload.current_job_id
  end

  test "polling acknowledges cancellation before contacting the provider" do
    sync = @item.syncs.create!(status: :syncing, syncing_at: Time.current, cancel_requested_at: Time.current, sync_stats: { SophtronItem::ManualSync::PROCESSED_IDS_KEY => [] })
    @item.update!(current_job_id: "job-1", current_job_sophtron_account_id: @provider_account.id)
    @remote.expects(:get_job_information).never
    result = SophtronItem::ManualSync.new(@item).poll!
    assert_equal "cancelled", result[:status]
    assert sync.reload.stale?
    assert_nil @item.reload.current_job_id
  end
end
