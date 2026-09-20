class Transfer::Matcher
  Result = Data.define(:transfer, :error)

  # Builds (and persists) a confirmed Transfer for a source transaction, using
  # the same semantics as the classic TransferMatchesController:
  #
  # - method: "existing" links the transaction to another existing entry
  #   (matched_entry_id); "new" creates a counterpart transaction on the
  #   target account (target_account_id).
  # - The destination (inflow) account determines the outflow kind, matching
  #   Transfer::Creator logic, including the Investment Contributions category.
  #
  # Returns a Result with either :transfer or :error (a user-facing message).
  def self.match(transaction:, method:, matched_entry_id: nil, target_account_id: nil, accessible_accounts:, accessible_entries:)
    case method
    when "existing"
      entry = accessible_entries.find_by(id: matched_entry_id)
      return Result.new(nil, "Matched transaction not found") if entry.nil?
      return Result.new(nil, "Cannot match a transaction to itself") if entry.transaction == transaction

      target_transaction = entry.transaction
      transfer = Transfer.find_or_initialize_by(
        inflow_transaction: transaction.entry.amount.negative? ? transaction : target_transaction,
        outflow_transaction: transaction.entry.amount.negative? ? target_transaction : transaction
      )
    when "new"
      account = accessible_accounts.find_by(id: target_account_id)
      return Result.new(nil, "Target account not found") if account.nil?

      missing_transaction = Transaction.new(
        entry: account.entries.build(
          amount: transaction.entry.amount * -1,
          currency: transaction.entry.currency,
          date: transaction.entry.date,
          name: "Transfer to #{transaction.entry.amount.negative? ? transaction.entry.account.name : account.name}",
          user_modified: true
        )
      )

      transfer = Transfer.find_or_initialize_by(
        inflow_transaction: transaction.entry.amount.positive? ? missing_transaction : transaction,
        outflow_transaction: transaction.entry.amount.positive? ? transaction : missing_transaction
      )
    else
      return Result.new(nil, "method must be \"existing\" or \"new\"")
    end

    transfer.status = "confirmed"

    transfer.save!

    # Use DESTINATION (inflow) account for kind, matching Transfer::Creator logic
    destination_account = transfer.inflow_transaction.entry.account
    outflow_kind = Transfer.kind_for_account(destination_account)
    outflow_attrs = { kind: outflow_kind }

    if outflow_kind == "investment_contribution"
      category = destination_account.family.investment_contributions_category
      outflow_attrs[:category] = category if category.present? && transfer.outflow_transaction.category_id.blank?
    end

    transfer.outflow_transaction.update!(outflow_attrs)
    transfer.inflow_transaction.update!(kind: "funds_movement")

    Result.new(transfer, nil)
  end
end
