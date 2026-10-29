module Family::PlaidConnectable
  extend ActiveSupport::Concern

  included do
    has_many :plaid_items, dependent: :destroy
  end

  def can_connect_plaid_us?
    plaid(:us).present?
  end

  # If Plaid provider is configured and user is in the EU region
  def can_connect_plaid_eu?
    plaid(:eu).present? && self.eu?
  end

  def create_plaid_item!(public_token:, item_name:, region:, owner: Current.user)
    public_token_response = plaid(region).exchange_public_token(public_token)

    plaid_item = plaid_items.create!(
      name: item_name,
      plaid_id: public_token_response.item_id,
      access_token: public_token_response.access_token,
      plaid_region: region,
      owner: owner
    )

    plaid_item.sync_later

    plaid_item
  end

  def get_link_token(webhooks_url:, redirect_url:, accountable_type: nil, region: :us, access_token: nil, account_selection_enabled: false)
    return nil unless plaid(region)

    plaid(region).get_link_token(
      user_id: self.id,
      webhooks_url: webhooks_url,
      redirect_url: redirect_url,
      accountable_type: accountable_type,
      access_token: access_token,
      account_selection_enabled: account_selection_enabled
    ).link_token
  end

  def plaid_webhooks_url(region:, url_options:)
    routes = Rails.application.routes.url_helpers
    eu = region.to_s == "eu"
    return eu ? routes.webhooks_plaid_eu_url(**url_options) : routes.webhooks_plaid_url(**url_options) if Rails.env.production?

    root = ENV.fetch("DEV_WEBHOOKS_URL", routes.root_url(**url_options).chomp("/"))
    root + (eu ? "/webhooks/plaid_eu" : "/webhooks/plaid")
  end

  private
    def plaid(region)
      Provider::Registry.plaid_provider_for_region(region)
    end
end
