class ProviderReplacementOperation < ApplicationRecord
  include Encryptable

  encrypts :audit if encryption_ready?

  belongs_to :account
  belongs_to :simplefin_account, optional: true
  belongs_to :actor, class_name: "User", optional: true

  validates :idempotency_key, :request_digest, presence: true
end
