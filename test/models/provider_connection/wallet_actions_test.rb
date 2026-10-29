# frozen_string_literal: true

require "test_helper"

class ProviderConnection::WalletActionsTest < ActiveSupport::TestCase
  include OnchainTestHelper

  setup do
    register_fake_chain!
    @user = users(:family_admin)
    @family = @user.family
    @connection = ProviderConnection.new(family: @family, user: @user, provider: "onchain_wallet")
    Onchain::SecurityResolver.stubs(:priceable?).returns(true)
    stub_fake_snapshot(FAKE_ADDRESS, Onchain::Snapshot.new(assets: [ fake_native_asset ], movements: []))
  end

  teardown do
    unregister_fake_chain!
  end

  test "wallet preview returns explicit token choices without creating a connection" do
    assert_no_difference [ "OnchainWalletItem.count", "Account.count" ] do
      result = @connection.configure_wallet_action!("preview_wallet", { address: FAKE_ADDRESS, chain: FAKE_CHAIN })
      assert_equal FAKE_CHAIN, result[:chain]
      assert_equal "FAKE", result[:assets].sole[:symbol]
      assert result[:assets].sole[:preselected]
    end
  end

  test "wallet link uses selected asset keys and exposes no credentials" do
    OnchainWalletItem.any_instance.stubs(:sync_later)
    result = @connection.configure_wallet_action!("link_wallet", { address: FAKE_ADDRESS, chain: FAKE_CHAIN, assets: [ "native" ] })
    assert_equal 1, result[:created_count]
    assert result[:id].present?
    item = @family.onchain_wallet_items.find(result[:id])
    assert_equal FAKE_ADDRESS, item.onchain_wallet_accounts.sole.wallet_address
    assert item.onchain_wallet_accounts.sole.account_provider.present?
  end

  test "unknown chains and unsupported actions are rejected without persistence" do
    assert_no_difference "OnchainWalletItem.count" do
      assert_raises(ProviderConnection::Invalid) { @connection.configure_wallet_action!("preview_wallet", { address: FAKE_ADDRESS, chain: "not-a-chain" }) }
      assert_raises(ProviderConnection::Invalid) { @connection.configure_wallet_action!("unknown", { address: FAKE_ADDRESS, chain: FAKE_CHAIN }) }
    end
  end

  test "members cannot discover or link wallets through credential configuration" do
    connection = ProviderConnection.new(family: @family, user: users(:family_member), provider: "onchain_wallet")
    assert_raises(ProviderConnection::Forbidden) { connection.configure_wallet_action!("preview_wallet", { address: FAKE_ADDRESS, chain: FAKE_CHAIN }) }
  end

  test "wallet management rejects addresses not tracked by this connection" do
    item = create_onchain_wallet_item(family: @family)
    connection = ProviderConnection.new(family: @family, user: @user, provider: "onchain_wallet", id: item.id)
    assert_raises(ActiveRecord::RecordNotFound) { connection.configure_wallet_action!("disconnect_wallet", { address: FAKE_ADDRESS, chain: FAKE_CHAIN }) }
  end

  test "wallet provider errors are sanitized" do
    FakeAdapter.error = Onchain::Chains::UnreachableError.new("private-wallet-provider-secret")
    error = assert_raises(ProviderConnection::Invalid) { @connection.configure_wallet_action!("preview_wallet", { address: FAKE_ADDRESS, chain: FAKE_CHAIN }) }
    refute_includes error.message, "private-wallet-provider-secret"
  end
end
