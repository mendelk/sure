require "base64"
require "digest"
require "uri"

class WebPushSubscription < ApplicationRecord
  include Encryptable

  belongs_to :user
  belongs_to :session
  has_many :web_notification_deliveries, dependent: :delete_all
  has_many :targeted_notifications, class_name: "WebNotification", foreign_key: :target_subscription_id, dependent: :destroy
  encrypts :endpoint, :p256dh, :auth if encryption_ready?
  self.filter_attributes += [ :endpoint, :p256dh, :auth ]
  self.attributes_for_inspect = [ :id, :user_id, :label, :disabled_at, :last_status ]

  scope :enabled, -> { where(disabled_at: nil).joins(:session).where("sessions.user_id = web_push_subscriptions.user_id") }
  validates :endpoint, presence: true, length: { maximum: 4096 }
  validates :label, length: { maximum: 100 }
  validates :user_agent, length: { maximum: 500 }
  validates :last_seen_at, presence: true
  validate :safe_endpoint
  validate :valid_keys
  validate :session_owned_by_user
  before_validation :set_endpoint_digest

  def self.public_key
    ENV["WEB_PUSH_PUBLIC_KEY"].presence
  end

  def self.configured?
    public_key.present? && ENV["WEB_PUSH_PRIVATE_KEY"].present? &&
      ENV["WEB_PUSH_SUBJECT"].to_s.match?(/\A(?:mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)\z/)
  end

  # Enrollment is reachable only through the browser's authenticated CSRF-protected
  # session. A replacement receives a new ID, so delayed old-owner revocations
  # and queued deliveries can never affect the renewed registration.
  def self.register_for!(user:, session:, endpoint:, p256dh:, auth:, label: nil, user_agent: nil)
    candidate = new(user: user, session: session, endpoint: endpoint, p256dh: p256dh, auth: auth,
      label: label, user_agent: user_agent.to_s.truncate(500), last_seen_at: Time.current)
    raise ActiveRecord::RecordInvalid, candidate unless candidate.valid?
    attempts = 0
    begin
      transaction(requires_new: true) do
        existing = lock.find_by(endpoint_digest: candidate.endpoint_digest)
        if existing && existing.user_id != user.id &&
            (existing.p256dh != p256dh || existing.auth != auth)
          candidate.errors.add(:base, "Browser subscription credentials do not match")
          raise ActiveRecord::RecordInvalid, candidate
        end
        if existing && (existing.user_id != user.id || existing.p256dh != p256dh || existing.auth != auth)
          existing.destroy!
          existing = nil
        end
        if existing
          existing.update!(session: session, label: label, user_agent: candidate.user_agent, last_seen_at: Time.current, disabled_at: nil)
          existing
        else
          candidate.save!
          candidate
        end
      end
    rescue ActiveRecord::RecordNotUnique
      attempts += 1
      retry if attempts < 3
      raise
    end
  end

  def endpoint_allowed?
    uri = URI.parse(endpoint.to_s)
    return false unless uri.is_a?(URI::HTTPS) && uri.port == 443 && uri.userinfo.nil? && uri.fragment.nil?

    host = uri.host.to_s.downcase
    host == "fcm.googleapis.com" || host == "updates.push.services.mozilla.com" ||
      host.match?(/\A[a-z0-9-]+\.push\.apple\.com\z/) ||
      host.match?(/\A(?:[a-z0-9-]+\.)+notify\.windows\.com\z/)
  rescue URI::InvalidURIError
    false
  end

  def serializable_hash(options = nil)
    super(options).except("endpoint", "p256dh", "auth")
  end

  private
    def session_owned_by_user
      valid_session = session&.persisted? && session.user_id == user_id &&
        Session.joins(:user).where(id: session_id, user_id: user_id, users: { active: true }).exists?
      unless valid_session
        errors.add(:session, :invalid)
      end
    end

    def set_endpoint_digest
      self.endpoint_digest = Digest::SHA256.hexdigest(endpoint.to_s)
    end

    def safe_endpoint
      errors.add(:endpoint, :invalid) unless endpoint_allowed?
    end

    def valid_keys
      public_bytes = decode_key(p256dh)
      auth_bytes = decode_key(auth)
      errors.add(:p256dh, :invalid) unless public_bytes&.bytesize == 65 && public_bytes.getbyte(0) == 4
      errors.add(:auth, :invalid) unless auth_bytes&.bytesize == 16
    end

    def decode_key(value)
      return unless value.is_a?(String) && value.match?(/\A[A-Za-z0-9_-]+={0,2}\z/)
      Base64.urlsafe_decode64(value)
    rescue ArgumentError
      nil
    end
end
