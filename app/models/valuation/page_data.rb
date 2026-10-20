class Valuation::PageData
  TEXT_KEYS = {
    title_new: "new.title", title_show: "header.balance",
    date: "show.date_label", amount: "show.amount", overview: "show.overview",
    details: "show.details", settings: "show.settings", notes: "show.note_label",
    notes_placeholder: "show.note_placeholder", confirm_create: "confirm_create.confirm",
    confirm_update: "confirm_update.update", confirmation_title_create: "confirm_create.title",
    confirmation_title_update: "confirm_update.title", delete: "show.delete",
    delete_title: "show.delete_title", delete_subtitle: "show.delete_subtitle",
    opening_balance: "show.opening_balance", total_account_value: "confirmation_contents.total_account_value",
    holdings_value: "confirmation_contents.holdings_value", brokerage_cash: "confirmation_contents.brokerage_cash"
  }.freeze

  SPA_TEXT_KEYS = %i[
    account currency preview back cancel save_notes delete_confirm_title delete_confirm_body
    loading unavailable retry request_failed notes_saved no_accounts
  ].freeze

  def initialize(entry:, accounts:, permissions:)
    @entry, @accounts, @permissions = entry, accounts, permissions
  end

  def as_json(*)
    {
      accounts: @accounts.map do |account|
        {
          id: account.id, name: account.name, currency: account.currency,
          accountable_type: account.accountable_type, linked: account.linked?
        }
      end,
      account_id: @entry.account_id,
      entry: {
        id: @entry.id, name: @entry.name, date: @entry.date.iso8601,
        amount: @entry.new_record? ? "" : @entry.amount.to_d.to_s("F"), currency: @entry.currency, notes: @entry.notes,
        kind: @entry.entryable.kind, formatted_amount: @entry.new_record? ? "" : @entry.amount_money.format,
        date_label: I18n.l(@entry.date, format: :long)
      },
      permissions: @permissions,
      date_bounds: { min: Entry.min_supported_date.next_day.iso8601, max: Date.current.iso8601 },
      text: TEXT_KEYS.transform_values { |key| I18n.t("valuations.#{key}") }.merge(
        SPA_TEXT_KEYS.index_with { |key| I18n.t("valuations.spa.#{key}") }
      )
    }
  end

  def self.confirmation(account:, date:, result:, is_update:)
    scope = "valuations.confirmation_contents"
    action = I18n.t("#{scope}.action_#{is_update ? 'update' : 'set'}")
    date_label = I18n.l(date, format: :long)
    total_value = Money.new(result.new_balance, account.currency).format
    investment = account.investment?
    brokerage_cash = result.new_cash_balance || 0 if investment

    description = if investment
      "#{I18n.t("#{scope}.this_will", action_verb: action)} #{date_label} #{I18n.t("#{scope}.to_colon")}"
    else
      balance_key = {
        "Depository" => "account_balance", "CreditCard" => "credit_card_balance", "Loan" => "loan_balance",
        "Property" => "property_value", "Vehicle" => "vehicle_value", "Crypto" => "crypto_balance",
        "OtherAsset" => "asset_value", "OtherLiability" => "liability_balance"
      }.fetch(account.accountable_type, "balance")
      I18n.t("#{scope}.description", action: action.capitalize,
        balance: I18n.t("#{scope}.#{balance_key}"), date: date_label, amount: total_value)
    end

    {
      description: description,
      notice: I18n.t("#{scope}.recalculate_notice",
        change_or_update: I18n.t("#{scope}.#{is_update ? 'change' : 'update'}")),
      investment: investment, total_value: total_value,
      holdings_value: investment ? Money.new(result.new_balance - brokerage_cash, account.currency).format : nil,
      brokerage_cash: investment ? Money.new(brokerage_cash, account.currency).format : nil,
      brokerage_cash_negative: investment && brokerage_cash.negative?
    }
  end
end
