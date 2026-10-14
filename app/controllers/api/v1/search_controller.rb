# frozen_string_literal: true

module Api
  module V1
    # Global search backing the SPA ⌘K palette. Runs one family-scoped
    # pg_search query per type (accounts, transactions, categories,
    # merchants) and returns grouped hits with the URL each hit navigates to.
    class SearchController < BaseController
      before_action :ensure_read_scope, only: :index

      DEFAULT_PER_TYPE = 6
      MAX_PER_TYPE = 20

      def index
        query = params[:q].to_s.strip
        return render_json({ query: "", results: empty_results }) if query.blank?

        per_type = clamped_per_type
        family = current_resource_owner.family
        user = current_resource_owner

        render_json({
          query: query,
          results: {
            accounts: account_hits(family, user, query, per_type),
            transactions: transaction_hits(family, user, query, per_type),
            categories: category_hits(family, query, per_type),
            merchants: merchant_hits(family, user, query, per_type)
          }
        })
      end

      private

        def empty_results
          { accounts: [], transactions: [], categories: [], merchants: [] }
        end

        def clamped_per_type
          raw = params[:per_type].to_i
          return DEFAULT_PER_TYPE if raw <= 0
          [ raw, MAX_PER_TYPE ].min
        end

        # Smart amount: strips currency symbols/commas so "$1,234.50" matches
        # entries.amount within a cent (same tolerance as EntrySearch).
        def parsed_amount(query)
          normalized = query.to_s.strip.gsub(/[$,\s]/, "")
          return nil unless normalized.match?(/\A-?\d+(\.\d{1,4})?\z/)

          BigDecimal(normalized)
        rescue ArgumentError
          nil
        end

        # pg_search orders by its rank expression, which conflicts with the
        # SELECT DISTINCT in Account.accessible_by. So rank IDs first (no
        # DISTINCT in that scope), then load tenancy-scoped records and
        # restore rank order in Ruby. Limits are tiny, so this stays cheap.
        def in_rank_order(ranked_ids, records, limit)
          by_id = records.index_by(&:id)
          ranked_ids.filter_map { |id| by_id[id] }.first(limit)
        end

        def account_hits(family, user, query, limit)
          ranked_ids = family.accounts.global_search(query).pluck(:id)
          records = family.accounts
            .accessible_by(user)
            .where.not(status: "pending_deletion")
            .where(id: ranked_ids)

          in_rank_order(ranked_ids, records, limit).map do |account|
            {
              id: account.id,
              type: "account",
              title: account.name,
              subtitle: account.balance_money.format,
              url: "/accounts/#{account.id}"
            }
          end
        end

        def transaction_hits(family, user, query, limit)
          accessible_ids = family.accounts.accessible_by(user).select(:id)
          scope = family.transactions
            .where(entries: { account_id: accessible_ids })
            .merge(Entry.excluding_split_parents)

          text_ids = scope.global_search(query).pluck(:id)

          amount = parsed_amount(query)
          amount_ids = if amount
            scope.where("ABS(ABS(entries.amount) - ?) <= 0.01", amount.abs).pluck(:id)
          else
            []
          end

          ranked_ids = (text_ids + amount_ids).uniq
          records = Transaction.where(id: ranked_ids)
            .includes(entry: :account, merchant: nil, category: nil)

          in_rank_order(ranked_ids, records, limit).map do |transaction|
            entry = transaction.entry
            {
              id: transaction.id,
              type: "transaction",
              title: entry.name,
              subtitle: [ entry.account.name, entry.amount_money.format ].compact.join(" · "),
              url: "/transactions/#{transaction.id}"
            }
          end
        end

        def category_hits(family, query, limit)
          family.categories
            .global_search(query)
            .limit(limit)
            .map do |category|
              {
                id: category.id,
                type: "category",
                title: category.name,
                subtitle: "Category",
                url: "/transactions?#{URI.encode_www_form([ [ "categories[]", category.name ] ])}"
              }
            end
        end

        def merchant_hits(family, user, query, limit)
          family_merchant_ids = family.merchants.select(:id)
          accessible_ids = family.accounts.accessible_by(user).select(:id)
          provider_ids = Transaction.joins(:entry)
            .where(entries: { account_id: accessible_ids })
            .where.not(merchant_id: nil)
            .select(:merchant_id)

          ranked_ids = Merchant
            .where(id: family_merchant_ids)
            .or(Merchant.where(id: provider_ids, type: "ProviderMerchant"))
            .global_search(query)
            .pluck(:id)
            .uniq

          records = Merchant.where(id: ranked_ids).distinct

          in_rank_order(ranked_ids, records, limit).map do |merchant|
            {
              id: merchant.id,
              type: "merchant",
              title: merchant.name,
              subtitle: "Merchant",
              url: "/transactions?#{URI.encode_www_form([ [ "merchants[]", merchant.name ] ])}"
            }
          end
        end
    end
  end
end
