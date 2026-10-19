class SimplefinAccount::Processor
  include SimplefinNumericHelpers
  attr_reader :simplefin_account, :skipped_entries

  def initialize(simplefin_account)
    @simplefin_account = simplefin_account
    @skipped_entries = []
  end

  # Each step represents different SimpleFin data processing
  # Processing the account is the first step and if it fails, we halt
  # Each subsequent step can fail independently, but we continue processing
  def process
    simplefin_account.with_ingestion_lock { process_locked }
  end

  def process_locked
    # If the account is missing (e.g., user deleted the connection and re‑linked later),
    # do not auto‑link. Relinking is now a manual, user‑confirmed flow via the Relink modal.
    unless simplefin_account.current_account.present?
      return
    end

    simplefin_account.current_account.update!(balance_snapshot)
    # Ensure provider link exists after processing the account/balance
    begin
      simplefin_account.ensure_account_provider!
    rescue => e
      Rails.logger.warn("SimpleFin provider link ensure failed for #{simplefin_account.id}: #{e.class} - #{e.message}")
    end
    process_transactions
    process_investments
    process_liabilities
  end

  private :process_locked

  # Calculate without mutating balances; replacement previews use exactly the
  # same liability normalization and explicit sign override as provider sync.
  def balance_snapshot(account: simplefin_account.current_account)
    return unless account

    # Extract raw values from SimpleFIN snapshot
    bal   = to_decimal(simplefin_account.current_balance)
    avail = to_decimal(simplefin_account.available_balance)

    # Explicit zero is a balance, not a missing observation.
    observed = simplefin_account.current_balance.nil? ? avail : bal
    is_linked_liability = [ "CreditCard", "Loan" ].include?(account.accountable_type)
    raw = (simplefin_account.raw_payload || {}).with_indifferent_access
    org = (simplefin_account.org_data || {}).with_indifferent_access
    inferred = Simplefin::AccountTypeMapper.infer(
      name: simplefin_account.name,
      holdings: raw[:holdings],
      extra: simplefin_account.extra,
      balance: bal,
      available_balance: avail,
      institution: org[:name]
    ) rescue nil
    is_mapper_liability = inferred && [ "CreditCard", "Loan" ].include?(inferred.accountable_type)
    is_liability = account.accountable_type.present? ? is_linked_liability : is_mapper_liability

    if is_mapper_liability && !is_linked_liability
      Rails.logger.warn(
        "SimpleFIN account type mismatch: linked account #{account.id} type=#{account.accountable_type} " \
        "differs from mapper inference (#{inferred.accountable_type}). Using linked account type."
      )
    end

    balance = observed
    if is_liability
      # Loan principal is positive debt; the credit-card heuristic is not
      # applicable to loans with no revolving-charge history.
      if account.accountable_type == "Loan"
        balance = observed.abs
        Rails.logger.info("SimpleFIN liability sign: classification=loan sfa=#{simplefin_account.id}")
        Rails.logger.debug(
          "SimpleFIN liability sign (loan) amounts: sfa=#{simplefin_account.id} " \
          "observed=#{observed.to_s('F')} stored=#{balance.to_s('F')}"
        )
        Sentry.add_breadcrumb(Sentry::Breadcrumb.new(
          category: "simplefin", message: "liability_sign=loan", data: { sfa_id: simplefin_account.id }
        )) rescue nil
      else
        case simplefin_account.balance_sign_override
        when "credit"
          balance = -observed.abs
          Rails.logger.info("SimpleFIN liability sign: classification=credit_override sfa=#{simplefin_account.id}")
        when "debt"
          balance = observed.abs
          Rails.logger.info("SimpleFIN liability sign: classification=debt_override sfa=#{simplefin_account.id}")
        else
          begin
            result = SimplefinAccount::Liabilities::OverpaymentAnalyzer.new(simplefin_account, observed_balance: observed).call
            case result.classification
            when :credit
              balance = -observed.abs
            when :debt
              balance = observed.abs
            else
              balance = normalize_liability_balance(observed, bal, avail)
            end
            Rails.logger.info(
              "SimpleFIN liability sign: classification=#{result.classification} sfa=#{simplefin_account.id} " \
              "tx_count=#{result.metrics[:tx_count]}"
            )
            Rails.logger.debug(
              "SimpleFIN overpayment heuristic: sfa=#{simplefin_account.id} observed=#{observed.to_s('F')} " \
              "reason=#{result.reason} metrics=#{result.metrics.slice(:charges_total, :payments_total, :tx_count).inspect}"
            )
            if %i[credit debt].include?(result.classification)
              Sentry.add_breadcrumb(Sentry::Breadcrumb.new(
                category: "simplefin", message: "liability_sign=#{result.classification}", data: { sfa_id: simplefin_account.id }
              )) rescue nil
            end
          rescue NameError
            balance = normalize_liability_balance(observed, bal, avail)
          rescue => error
            Rails.logger.warn("SimpleFIN overpayment heuristic error for sfa=#{simplefin_account.id}: #{error.class} - #{error.message}")
            balance = normalize_liability_balance(observed, bal, avail)
          end
        end
      end
    end

    cash_balance = if account.accountable_type == "Investment"
      SimplefinAccount::Investments::BalanceCalculator.new(simplefin_account).cash_balance
    else
      balance
    end
    { balance: balance, cash_balance: cash_balance, currency: simplefin_account.currency }
  end

  private
    def process_transactions
      processor = SimplefinAccount::Transactions::Processor.new(simplefin_account)
      processor.process
      @skipped_entries.concat(processor.skipped_entries)
    rescue => e
      report_exception(e, "transactions")
    end

    def process_investments
      return unless simplefin_account.current_account&.accountable_type == "Investment"
      SimplefinAccount::Investments::TransactionsProcessor.new(simplefin_account).process
      SimplefinAccount::Investments::HoldingsProcessor.new(simplefin_account).process
    rescue => e
      report_exception(e, "investments")
    end

    def process_liabilities
      case simplefin_account.current_account&.accountable_type
      when "CreditCard"
        SimplefinAccount::Liabilities::CreditProcessor.new(simplefin_account).process
      when "Loan"
        SimplefinAccount::Liabilities::LoanProcessor.new(simplefin_account).process
      end
    rescue => e
      report_exception(e, "liabilities")
    end

    def report_exception(error, context)
      Sentry.capture_exception(error) do |scope|
        scope.set_tags(
          simplefin_account_id: simplefin_account.id,
          context: context
        )
      end
    end

    # Helpers
    # to_decimal and same_sign? provided by SimplefinNumericHelpers concern

    def normalize_liability_balance(observed, bal, avail)
      both_present = bal.nonzero? && avail.nonzero?
      if both_present && same_sign?(bal, avail)
        if bal.positive? && avail.positive?
          return -observed.abs
        elsif bal.negative? && avail.negative?
          return observed.abs
        end
      end
      -observed
    end
end
