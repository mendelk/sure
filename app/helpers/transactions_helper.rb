module TransactionsHelper
  def transaction_search_filters
    [
      { key: "account_filter", label: t("transactions.search.filters.account"), icon: "layers" },
      { key: "date_filter", label: t("transactions.search.filters.date"), icon: "calendar" },
      { key: "type_filter", label: t("transactions.search.filters.type"), icon: "tag" },
      { key: "status_filter", label: t("transactions.search.filters.status"), icon: "clock" },
      { key: "amount_filter", label: t("transactions.search.filters.amount"), icon: "hash" },
      { key: "category_filter", label: t("transactions.search.filters.category"), icon: "shapes" },
      { key: "tag_filter", label: t("transactions.search.filters.tag"), icon: "tags" },
      { key: "merchant_filter", label: t("transactions.search.filters.merchant"), icon: "store" }
    ]
  end

  def get_transaction_search_filter_partial_path(filter)
    "transactions/searches/filters/#{filter[:key]}"
  end

  def get_default_transaction_search_filter
    transaction_search_filters[0]
  end

  def transaction_search_autocomplete_filters
    [
      autocomplete_options_filter("account", "account", "q[accounts][]"),
      {
        key: "date",
        label: t("transactions.search.filters.date"),
        kind: "branch",
        options: [
          autocomplete_value_filter("start-date", t("transactions.searches.filters.date_filter.start_date"), "q[start_date]"),
          autocomplete_value_filter("end-date", t("transactions.searches.filters.date_filter.end_date"), "q[end_date]")
        ]
      },
      autocomplete_options_filter("type", "type", "q[types][]"),
      autocomplete_options_filter("status", "status", "q[status][]"),
      {
        key: "amount",
        label: t("transactions.search.filters.amount"),
        kind: "branch",
        options: [
          autocomplete_value_filter("amount-equal", t("transactions.searches.filters.amount_filter.equal_to"), "q[amount]", operator: "equal"),
          autocomplete_value_filter("amount-greater", t("transactions.searches.filters.amount_filter.greater_than"), "q[amount]", operator: "greater"),
          autocomplete_value_filter("amount-less", t("transactions.searches.filters.amount_filter.less_than"), "q[amount]", operator: "less")
        ]
      },
      autocomplete_options_filter("category", "category", "q[categories][]"),
      autocomplete_options_filter("tag", "tag", "q[tags][]"),
      autocomplete_options_filter("merchant", "merchant", "q[merchants][]")
    ]
  end

  def in_split_group?(entry, params_grouped)
    entry.split_child? && Current.user.show_split_grouped? && params_grouped == "true"
  end

  private
    def autocomplete_options_filter(key, translation_key, input_name)
      {
        key: key,
        label: t("transactions.search.filters.#{translation_key}"),
        kind: "options",
        inputName: input_name
      }
    end

    def autocomplete_value_filter(key, label, input_name, operator: nil)
      {
        key: key,
        label: label,
        kind: "value",
        inputName: input_name,
        operator: operator
      }.compact
    end

  public

  # ---- Transaction extra details helpers ----
  # Returns a structured hash describing extra details for a transaction.
  # Input can be a Transaction or an Entry (responds_to :transaction).
  # Structure:
  #   {
  #     kind: :simplefin | :raw,
  #     simplefin: { payee:, description:, memo: },
  #     provider_extras: [ { key:, value:, title: } ],
  #     raw: String (pretty JSON or string)
  #   }
  def build_transaction_extra_details(obj)
    tx = obj.respond_to?(:transaction) ? obj.transaction : obj
    return nil unless tx.respond_to?(:extra) && tx.extra.present?

    extra = tx.extra

    if extra.is_a?(Hash) && extra["simplefin"].present?
      sf = extra["simplefin"]
      simple = {
        payee: sf.is_a?(Hash) ? sf["payee"].presence : nil,
        description: sf.is_a?(Hash) ? sf["description"].presence : nil,
        memo: sf.is_a?(Hash) ? sf["memo"].presence : nil
      }.compact

      extras = []
      if sf.is_a?(Hash) && sf["extra"].is_a?(Hash) && sf["extra"].present?
        sf["extra"].each do |k, v|
          display = (v.is_a?(Hash) || v.is_a?(Array)) ? v.to_json : v
          extras << {
            key: k.to_s.humanize,
            value: display,
            title: (v.is_a?(String) ? v : display.to_s)
          }
        end
      end

      {
        kind: :simplefin,
        simplefin: simple,
        provider_extras: extras,
        raw: nil
      }
    else
      pretty = begin
        JSON.pretty_generate(extra)
      rescue StandardError
        extra.to_s
      end
      {
        kind: :raw,
        simplefin: {},
        provider_extras: [],
        raw: pretty
      }
    end
  end
end
