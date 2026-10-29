# frozen_string_literal: true

require "test_helper"

class ProviderConnection::AccountSetupTest < ActiveSupport::TestCase
  setup do
    @family = families(:dylan_family)
    @user = users(:family_admin)
    @item = coinspot_items(:one)
    @provider_account = coinspot_accounts(:one)
    @connection = connection("coinspot", @item)
    Current.session = sessions(:one)
  end

  teardown do
    Current.reset
  end

  test "every registered provider exposes local setup metadata without credentials" do
    ProviderConnectionStatus::PROVIDERS.each do |provider|
      item = provider[:type].constantize.new(family: @family)
      item.user = @user if provider[:key] == "financekit"
      domain = ProviderConnection.new(family: @family, user: @user, provider: provider[:key])
      domain.stubs(:item).returns(item)

      payload = domain.account_setup

      assert_equal provider[:key], payload[:provider]
      assert payload[:account_types].any?, provider[:key]
      assert_equal @user.id, payload[:default_owner_id]
      assert_empty payload[:accounts]
      assert_equal provider[:key] != "financekit", payload[:supports_setup]
      assert payload[:owners].any? { |owner| owner[:id] == @user.id }
      assert_empty payload.keys.grep(/token|secret|api_key|payload/)
    end
  end

  test "setup requires family administration except owned member Plaid connections" do
    member = users(:family_member)
    domain = ProviderConnection.new(family: @family, user: member, provider: "coinspot", id: @item.id)

    assert_raises(ProviderConnection::Forbidden) { domain.account_setup }
    assert_raises(ProviderConnection::Forbidden) { domain.complete_setup!(selections: []) }
    assert_raises(ProviderConnection::Forbidden) { domain.link_existing!(account_id: accounts(:investment).id, provider_account_id: @provider_account.id) }
  end

  test "another family's connection cannot be resolved" do
    assert_raises(ActiveRecord::RecordNotFound) do
      ProviderConnection.new(family: families(:empty), user: users(:empty), provider: "coinspot", id: @item.id)
    end
  end

  test "setup does not expose mapped private account names balances or raw account numbers" do
    account = accounts(:investment)
    account.update!(owner: users(:family_member))
    account.account_shares.destroy_all
    AccountProvider.create!(account: account, provider: @provider_account)
    payload = @connection.account_setup

    assert_empty payload[:accounts]
    assert_empty payload[:linked_accounts]
    assert_not_includes payload[:linkable_accounts].map { |candidate| candidate[:id] }, account.id
    assert_not_includes payload.to_json, @item.api_secret
    assert_not_includes payload.to_json, @provider_account.account_id
  end

  test "CoinSpot setup uses the shared exchange constructor and repeated selection is idempotent" do
    @connection.item.expects(:sync_later).once.returns(true)
    CoinspotAccount::Processor.any_instance.expects(:process).once

    result = @connection.complete_setup!(selections: [ { id: @provider_account.id, accountable_type: "Crypto" } ])
    account = @provider_account.reload.current_account
    assert_equal [ account.id ], result[:created_account_ids]
    assert_equal "Crypto", account.accountable_type
    assert_equal "exchange", account.accountable.subtype
    assert_equal "AUD", account.currency
    assert_equal 0, account.cash_balance

    repeated = @connection.complete_setup!(selections: [ { id: @provider_account.id, accountable_type: "Crypto" } ])
    assert_empty repeated[:created_account_ids]
    assert_equal [ account.id ], repeated[:existing_account_ids]
    assert_equal 1, AccountProvider.where(provider: @provider_account).count
  end

  test "linking a manual exchange account is idempotent and does not create another account" do
    account = manual_crypto("exchange")
    @connection.item.expects(:sync_later).once.returns(true)
    CoinspotAccount::Processor.any_instance.expects(:process).once

    assert_no_difference "Account.count" do
      first = @connection.link_existing!(account_id: account.id, provider_account_id: @provider_account.id)
      assert_not first[:already_linked]
      second = @connection.link_existing!(account_id: account.id, provider_account_id: @provider_account.id)
      assert second[:already_linked]
    end
    assert_equal account.id, @provider_account.reload.current_account.id
  end

  test "CoinSpot refuses manual wallet accounts and already linked destinations" do
    wallet = manual_crypto("wallet")
    @connection.item.expects(:sync_later).never
    assert_raises(ProviderConnection::Invalid) do
      @connection.link_existing!(account_id: wallet.id, provider_account_id: @provider_account.id)
    end

    exchange = manual_crypto("exchange")
    AccountProvider.create!(account: exchange, provider: kraken_accounts(:one))
    assert_raises(ProviderConnection::Conflict) do
      @connection.link_existing!(account_id: exchange.id, provider_account_id: @provider_account.id)
    end
  end

  test "administration does not bypass destination write permission" do
    account = manual_crypto("exchange")
    account.update!(owner: users(:family_member))
    account.account_shares.destroy_all
    account.share_with!(@user, permission: "read_write")

    assert_raises(ProviderConnection::Forbidden) do
      @connection.link_existing!(account_id: account.id, provider_account_id: @provider_account.id)
    end
    assert_nil @provider_account.reload.account_provider
  end

  test "another connection's provider account cannot be linked or selected" do
    other_item = CoinspotItem.create!(family: @family, name: "Other connection", api_key: "other-key", api_secret: "other-secret")
    foreign = other_item.coinspot_accounts.create!(name: "Other feed", account_id: "foreign", account_type: "combined", currency: "AUD", current_balance: 1)
    account = manual_crypto("exchange")

    assert_raises(ActiveRecord::RecordNotFound) do
      @connection.link_existing!(account_id: account.id, provider_account_id: foreign.id)
    end
    assert_raises(ActiveRecord::RecordNotFound) do
      @connection.complete_setup!(selections: [ { id: foreign.id, accountable_type: "Crypto" } ])
    end
    assert_nil foreign.reload.account_provider
  end

  test "a batch failure rolls back earlier account creation and mappings" do
    @connection.item.expects(:sync_later).never
    assert_no_difference [ "Account.count", "AccountProvider.count" ] do
      assert_raises(ActiveRecord::RecordNotFound) do
        @connection.complete_setup!(selections: [
          { id: @provider_account.id, accountable_type: "Crypto" },
          { id: SecureRandom.uuid, accountable_type: "Crypto" }
        ])
      end
    end
    assert_nil @provider_account.reload.account_provider
  end

  test "unsupported types subtypes and duplicate selections fail without creating accounts" do
    assert_no_difference [ "Account.count", "AccountProvider.count" ] do
      assert_raises(ProviderConnection::Invalid) do
        @connection.complete_setup!(selections: [ { id: @provider_account.id, accountable_type: "Object" } ])
      end
      assert_raises(ProviderConnection::Invalid) do
        @connection.complete_setup!(selections: [ { id: @provider_account.id, accountable_type: "Crypto", subtype: "wallet" } ])
      end
      assert_raises(ProviderConnection::Invalid) do
        @connection.complete_setup!(selections: [ { id: @provider_account.id }, { id: @provider_account.id } ])
      end
    end
  end

  test "queue failure preserves the successful link and returns a credential free warning" do
    @connection.item.stubs(:sync_later).raises(StandardError, "sensitive-token")
    CoinspotAccount::Processor.any_instance.stubs(:process)
    DebugLogEntry.expects(:capture).with do |attributes|
      attributes[:provider_key] == "coinspot" && attributes[:metadata][:error_class] == "StandardError" && !attributes.to_json.include?("sensitive-token")
    end

    result = @connection.complete_setup!(selections: [ { id: @provider_account.id, accountable_type: "Crypto" } ])

    assert @provider_account.reload.account_provider
    assert_equal "sync_schedule_failed", result[:warnings].first[:code]
    assert_not_includes result.to_json, "sensitive-token"
  end

  test "cached processing failure is reported separately from scheduling" do
    @connection.item.expects(:sync_later).returns(true)
    CoinspotAccount::Processor.any_instance.stubs(:process).raises(StandardError, "private-provider-response")
    DebugLogEntry.stubs(:capture)

    result = @connection.complete_setup!(selections: [ { id: @provider_account.id, accountable_type: "Crypto" } ])

    assert @provider_account.reload.account_provider
    assert_equal "processing_failed", result[:warnings].first[:code]
    assert_not_includes result.to_json, "private-provider-response"
  end

  test "Monobank skip persists and explicit selection clears it with the suggested subtype" do
    source = monobank_accounts(:black_card)
    domain = connection("monobank", source.monobank_item)
    domain.item.expects(:sync_later).once.returns(true)

    domain.complete_setup!(selections: [ { id: source.id, accountable_type: "skip" } ])
    assert source.reload.ignored?
    assert_empty domain.account_setup[:unlinked_accounts]

    result = domain.complete_setup!(selections: [ { id: source.id, accountable_type: "Depository" } ])
    assert_not source.reload.ignored?
    account = source.current_account
    assert_equal "UAH", account.currency
    assert_equal "checking", account.accountable.subtype
    assert_equal [ account.id ], result[:created_account_ids]
  end

  test "Fio loan creation normalizes negative debt and owner choices remain family scoped" do
    source = fio_accounts(:checking)
    source.update!(current_balance: -200)
    domain = connection("fio", source.fio_item)
    domain.item.expects(:sync_later).once.returns(true)

    result = domain.complete_setup!(selections: [ { id: source.id, accountable_type: "Loan", owner_id: users(:family_member).id } ])
    account = Account.find(result[:created_account_ids].first)
    assert_equal 200, account.balance
    assert_equal users(:family_member).id, account.owner_id
    assert_equal @user, Current.user
  end

  test "Wise jars retain savings subtype and currency" do
    source = wise_accounts(:jar)
    source.update!(raw_payload: { type: "SAVINGS" })
    domain = connection("wise", source.wise_item)
    domain.item.expects(:sync_later).returns(true)

    result = domain.complete_setup!(selections: [ { id: source.id } ])
    account = Account.find(result[:created_account_ids].first)
    assert_equal "Depository", account.accountable_type
    assert_equal "savings", account.accountable.subtype
    assert_equal "EUR", account.currency
  end

  test "IBKR and Trading212 only accept compatible manual investment accounts" do
    [ [ "ibkr", ibkr_accounts(:main_account) ], [ "trading212", trading212_accounts(:main_account) ] ].each do |provider, source|
      domain = connection(provider, source.public_send("#{provider}_item"))
      domain.item.expects(:sync_later).never
      assert_raises(ProviderConnection::Invalid) do
        domain.link_existing!(account_id: accounts(:depository).id, provider_account_id: source.id)
      end
      assert_raises(ProviderConnection::Conflict) do
        domain.link_existing!(account_id: accounts(:connected).id, provider_account_id: source.id)
      end
      assert_nil source.reload.account_provider
    end
  end

  test "Trade Republic crypto only links to exchange crypto or investment accounts" do
    item = trade_republic_items(:configured_item)
    source = item.trade_republic_accounts.create!(kind: "crypto", name: "Trade Republic Crypto", currency: "EUR")
    domain = connection("trade_republic", item)

    assert_raises(ProviderConnection::Invalid) do
      domain.link_existing!(account_id: accounts(:depository).id, provider_account_id: source.id)
    end
    assert_raises(ProviderConnection::Invalid) do
      domain.link_existing!(account_id: manual_crypto("wallet").id, provider_account_id: source.id)
    end
    domain.item.expects(:sync_later).returns(true)
    TradeRepublicAccount::Processor.any_instance.expects(:process)
    result = domain.link_existing!(account_id: accounts(:investment).id, provider_account_id: source.id)
    assert_equal accounts(:investment).id, result[:account_id]
  end

  test "SnapTrade preserves per account dates and rejects invalid dates atomically" do
    source = snaptrade_accounts(:fidelity_401k)
    domain = connection("snaptrade", source.snaptrade_item)
    domain.item.expects(:sync_later_with_follow_up).once.returns(true)
    date = 30.days.ago.to_date

    assert_raises(ProviderConnection::Invalid) do
      domain.complete_setup!(selections: [ { id: source.id, accountable_type: "Investment", sync_start_date: "not-a-date" } ])
    end
    assert_nil source.reload.account_provider
    assert_raises(ProviderConnection::Invalid) do
      domain.complete_setup!(selections: [ { id: source.id, accountable_type: "Investment", sync_start_date: Date.tomorrow.iso8601 } ])
    end

    result = domain.complete_setup!(selections: [ { id: source.id, accountable_type: "Investment", subtype: "401k", sync_start_date: date.iso8601 } ])
    account = Account.find(result[:created_account_ids].first)
    assert_equal date, source.reload.sync_start_date
    assert_equal "401k", account.accountable.subtype
    assert_equal source.cash_balance, account.cash_balance
    assert_not_includes domain.account_setup.to_json, source.account_number
  end

  test "Questrade keeps the exposed depository choice and Redbark keeps debt choices" do
    [ [ "questrade", questrade_accounts(:one), "Depository", "checking" ],
      [ "redbark", redbark_accounts(:savings_account), "Loan", "mortgage" ] ].each do |provider, source, type, subtype|
      domain = connection(provider, source.public_send("#{provider}_item"))
      domain.item.expects(:sync_later).returns(true)
      result = domain.complete_setup!(selections: [ { id: source.id, accountable_type: type, subtype: subtype, balance: "125.25" } ])
      account = Account.find(result[:created_account_ids].first)
      assert_equal type, account.accountable_type
      assert_equal subtype, account.accountable.subtype
      assert_equal BigDecimal("125.25"), account.balance
    end
  end

  test "SimpleFIN setup preserves legacy linkage and skip completion state" do
    item = @family.simplefin_items.create!(name: "SimpleFIN", access_url: "https://example.com/secret", pending_account_setup: true)
    source = item.simplefin_accounts.create!(name: "Card", account_id: "card", account_type: "credit", currency: "USD", current_balance: -250)
    domain = connection("simplefin", item)
    domain.item.expects(:sync_later).returns(true)

    result = domain.complete_setup!(selections: [ { id: source.id, accountable_type: "CreditCard" } ])
    account = Account.find(result[:created_account_ids].first)
    assert_equal 250, account.balance
    assert_equal "credit_card", account.accountable.subtype
    assert_equal source.id, account.simplefin_account_id
    assert_equal account.id, source.reload.account_provider.account_id
    assert_not item.reload.pending_account_setup?
  end

  test "Akahu and Up preserve suggested savings and investment subtypes" do
    akahu = @family.akahu_items.create!(name: "Akahu", app_token: "test-app", user_token: "test-user")
    kiwi = akahu.akahu_accounts.create!(name: "KiwiSaver", currency: "NZD", account_type: "KIWISAVER", current_balance: 1000)
    up = @family.up_items.create!(name: "Up", access_token: "test-access")
    saver = up.up_accounts.create!(name: "Saver", currency: "AUD", account_type: "SAVER", current_balance: 250)

    [ [ "akahu", kiwi, "Investment", "retirement" ], [ "up", saver, "Depository", "savings" ] ].each do |provider, source, type, subtype|
      domain = connection(provider, source.public_send("#{provider}_item"))
      domain.item.expects(:sync_later).returns(true)
      result = domain.complete_setup!(selections: [ { id: source.id } ])
      account = Account.find(result[:created_account_ids].first)
      assert_equal type, account.accountable_type
      assert_equal subtype, account.accountable.subtype
      assert_equal source.currency, account.currency
    end
    assert_equal 0, kiwi.reload.current_account.cash_balance
  end

  test "Lunchflow Mercury Brex and Indexa Capital create their supported account kinds" do
    [ [ "lunchflow", lunchflow_accounts(:investment_account), "Investment", "brokerage" ],
      [ "mercury", mercury_accounts(:checking_account), "Depository", "checking" ],
      [ "brex", brex_accounts(:checking_account), "Depository", "checking" ],
      [ "indexa_capital", indexa_capital_accounts(:mutual_fund), "Investment", "mutual_fund" ] ].each do |provider, source, type, subtype|
      domain = connection(provider, source.public_send("#{provider}_item"))
      domain.item.expects(:sync_later).returns(true)
      result = domain.complete_setup!(selections: [ { id: source.id, accountable_type: type, subtype: subtype } ])
      account = Account.find(result[:created_account_ids].first)
      assert_equal type, account.accountable_type
      assert_equal subtype, account.accountable.subtype
      assert_equal source.currency, account.currency
    end
  end

  test "Enable Banking uses shared credit card construction and completes setup" do
    item = @family.enable_banking_items.create!(name: "Enable Banking", country_code: "FI", application_id: "test-app", client_certificate: "test-certificate", pending_account_setup: true)
    source = item.enable_banking_accounts.create!(uid: SecureRandom.uuid, name: "Card", currency: "EUR", current_balance: -45)
    domain = connection("enable_banking", item)
    domain.item.expects(:sync_later).returns(true)
    result = domain.complete_setup!(selections: [ { id: source.id, accountable_type: "CreditCard" } ])
    account = Account.find(result[:created_account_ids].first)
    assert_equal 45, account.balance
    assert_equal "credit_card", account.accountable.subtype
    assert_not item.reload.pending_account_setup?
  end

  test "Sophtron starts initial loading instead of scheduling a generic sync" do
    item = @family.sophtron_items.create!(name: "Sophtron", user_id: "test-user", access_key: "test-key")
    source = item.sophtron_accounts.create!(account_id: "test-account", name: "Checking", currency: "USD", balance: 140)
    domain = connection("sophtron", item)
    domain.item.expects(:sync_later).never
    domain.item.expects(:start_initial_load_later).returns(true)

    result = domain.complete_setup!(selections: [ { id: source.id, accountable_type: "Depository", subtype: "checking" } ])
    account = Account.find(result[:created_account_ids].first)
    assert_equal 140, account.balance
    assert_equal source.id, account.account_providers.sole.provider_id
  end

  test "Coinbase remapping requires write access to the displaced account" do
    item = @family.coinbase_items.create!(name: "Coinbase", api_key: "test-key", api_secret: "test-secret")
    source = item.coinbase_accounts.create!(name: "Crypto", currency: "USD")
    displaced = manual_crypto("exchange")
    displaced.update!(owner: users(:family_member))
    displaced.account_shares.destroy_all
    AccountProvider.create!(provider: source, account: displaced)
    destination = manual_crypto("exchange")
    domain = connection("coinbase", item)

    assert_raises(ProviderConnection::Forbidden) do
      domain.link_existing!(account_id: destination.id, provider_account_id: source.id)
    end
    assert_equal displaced.id, source.reload.current_account.id
  end

  test "CoinStats and onchain wallets preserve wallet compatibility" do
    stats = @family.coinstats_items.create!(name: "CoinStats", api_key: "test-key")
    stats_source = stats.coinstats_accounts.create!(name: "Wallet", currency: "USD", current_balance: 40, raw_payload: { source: "wallet" })
    chain = Onchain::Chains.all.first
    onchain = @family.onchain_wallet_items.create!(name: "Onchain")
    chain_source = onchain.onchain_wallet_accounts.create!(chain: chain.key, wallet_address: "wallet-address", asset_kind: Onchain::Chains::NATIVE_KIND,
      symbol: chain.native.symbol, decimals: chain.native.decimals, quantity: 1, currency: "USD")

    [ [ "coinstats", stats_source ], [ "onchain_wallet", chain_source ] ].each do |provider, source|
      domain = connection(provider, source.public_send("#{provider}_item"))
      assert_raises(ProviderConnection::Invalid) do
        domain.link_existing!(account_id: manual_crypto("exchange").id, provider_account_id: source.id)
      end
      domain.item.expects(:sync_later).returns(true)
      result = domain.complete_setup!(selections: [ { id: source.id, accountable_type: "Crypto" } ])
      account = Account.find(result[:created_account_ids].first)
      assert_equal "wallet", account.accountable.subtype
      assert_equal 0, account.cash_balance
    end
  end

  test "SimpleFIN likely closed defaults and stale deletion remain scoped" do
    item = @family.simplefin_items.create!(name: "SimpleFIN", access_url: "https://example.com/secret", raw_payload: { accounts: [ { id: "live" } ] })
    stale = item.simplefin_accounts.create!(name: "Old Checking", account_id: "old", account_type: "depository", currency: "USD", current_balance: 0)
    closed = item.simplefin_accounts.create!(name: "Closed Checking", account_id: "live", account_type: "depository", currency: "USD", current_balance: 0,
      raw_transactions_payload: [ { id: "old-transaction", posted: 120.days.ago.to_i, amount: "1" } ])
    stale_account = @family.accounts.create!(owner: @user, name: "Old account", balance: 0, currency: "USD", accountable: Depository.new(subtype: "checking"))
    AccountProvider.create!(provider: stale, account: stale_account)
    domain = connection("simplefin", item)
    metadata = domain.account_setup
    assert metadata[:unlinked_accounts].find { |account| account[:id] == closed.id }[:likely_closed]
    assert_equal "skip", metadata[:unlinked_accounts].find { |account| account[:id] == closed.id }[:accountable_type]
    assert_equal [ stale.id ], metadata[:stale_accounts].map { |account| account[:id] }

    assert_raises(ProviderConnection::Invalid) do
      domain.complete_setup!(selections: [], stale_account_actions: { closed.id => { action: "delete" } })
    end
    assert SimplefinAccount.exists?(closed.id)
    domain.complete_setup!(selections: [], stale_account_actions: { stale.id => { action: "delete" } })
    assert_not SimplefinAccount.exists?(stale.id)
    assert_not Account.exists?(stale_account.id)
  end

  test "foreign owner choices roll back setup" do
    assert_no_difference "Account.count" do
      assert_raises(ActiveRecord::RecordNotFound) do
        @connection.complete_setup!(selections: [ { id: @provider_account.id, accountable_type: "Crypto", owner_id: users(:empty).id } ])
      end
    end
    assert_nil @provider_account.reload.account_provider
  end

  test "owned member Plaid setup cannot assign accounts to another family member" do
    member = users(:family_member)
    item = @family.plaid_items.create!(name: "Member bank", owner: member, plaid_id: "member-bank", access_token: "test-token", plaid_region: "us")
    source = item.plaid_accounts.create!(name: "Savings", plaid_id: "member-savings", plaid_type: "depository", plaid_subtype: "savings", currency: "USD", current_balance: 50)
    domain = ProviderConnection.new(family: @family, user: member, provider: "plaid", id: item.id)
    assert_equal [ member.id ], domain.account_setup[:owners].map { |owner| owner[:id] }
    assert_raises(ActiveRecord::RecordNotFound) do
      domain.complete_setup!(selections: [ { id: source.id, owner_id: @user.id } ])
    end
    domain.item.expects(:sync_later).returns(true)
    result = domain.complete_setup!(selections: [ { id: source.id } ])
    account = Account.find(result[:created_account_ids].first)
    assert_equal member.id, account.owner_id
    assert_equal "savings", account.accountable.subtype
    assert_equal 50, account.balance
  end

  test "malformed setup UUIDs are rejected before locking or querying records" do
    @connection.item.expects(:lock!).never
    [ { id: "not-a-uuid", accountable_type: "Crypto" },
      { id: @provider_account.id, account_id: "not-a-uuid", accountable_type: "Crypto" },
      { id: @provider_account.id, owner_id: "not-a-uuid", accountable_type: "Crypto" } ].each do |selection|
      error = assert_raises(ProviderConnection::Invalid) do
        @connection.complete_setup!(selections: [ selection ])
      end
      assert_match(/must be a UUID/, error.message)
    end
    assert_nil @provider_account.reload.account_provider
  end

  test "malformed link UUIDs including provider specific parameter names fail before locking" do
    @connection.item.expects(:lock!).never
    [ { provider_account_id: "not-a-uuid", account_id: accounts(:investment).id },
      { provider_account_id: @provider_account.id, account_id: "not-a-uuid" },
      { coinspot_account_id: "not-a-uuid", account_id: accounts(:investment).id } ].each do |attributes|
      error = assert_raises(ProviderConnection::Invalid) { @connection.link_existing!(attributes) }
      assert_match(/must be a UUID/, error.message)
    end
    assert_nil @provider_account.reload.account_provider
  end

  test "malformed stale provider and move target UUIDs cannot change records" do
    item = @family.simplefin_items.create!(name: "SimpleFIN", access_url: "https://example.com/secret")
    domain = connection("simplefin", item)
    [ { "not-a-uuid" => { action: "delete" } },
      { SecureRandom.uuid => { action: "move", target_account_id: "not-a-uuid" } },
      { SecureRandom.uuid => { action: "move" } } ].each do |actions|
      assert_no_difference [ "Account.count", "SimplefinAccount.count" ] do
        error = assert_raises(ProviderConnection::Invalid) do
          domain.complete_setup!(selections: [], stale_account_actions: actions)
        end
        assert_match(/must be a UUID/, error.message)
      end
    end
  end

  private
    def connection(provider, item)
      ProviderConnection.new(family: @family, user: @user, provider: provider, id: item.id)
    end

    def manual_crypto(subtype)
      @family.accounts.create!(owner: @user, name: "Manual #{subtype}", balance: 10, cash_balance: 0, currency: "AUD", accountable: Crypto.new(subtype: subtype))
    end
end
