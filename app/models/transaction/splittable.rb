module Transaction::Splittable
  extend ActiveSupport::Concern

  def splittable?
    unmatched_investment_inflow = investment_contribution? && transfer.nil? && entry.account.investment? && entry.amount.negative?
    (!transfer? || unmatched_investment_inflow) && !entry.split_child? && !entry.split_parent? && !pending? && !entry.excluded?
  end
end
