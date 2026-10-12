module EntriesHelper
  def entry_name_detailed(entry)
    [
      entry.date,
      format_money(entry.amount_money),
      entry.account.name,
      entry.name
    ].join(" • ")
  end
end
