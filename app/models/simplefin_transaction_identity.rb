class SimplefinTransactionIdentity < ApplicationRecord
  belongs_to :simplefin_account
  belongs_to :entry, optional: true

  # A NULL entry is a tombstone, not an invitation to import again. Deleting a
  # reconciled transaction must not make an old cached feed resurrect it.
  validates :external_id, presence: true
end
