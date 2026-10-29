# frozen_string_literal: true

class Merchant::ApiWorkspace
  def initialize(family:, user:)
    @family = family
    @user = user
  end

  def index(params)
    family_merchants = @family.merchants.alphabetically
    provider_merchants = @family.assigned_merchants_for(@user).where(type: "ProviderMerchant").alphabetically
    unlinked_ids = FamilyMerchantAssociation.where(family: @family).recently_unlinked.select(:merchant_id)
    unlinked = ProviderMerchant.where(id: unlinked_ids).where.not(id: provider_merchants.select(:id)).alphabetically
    {
      family_merchants: group(search(family_merchants, params[:family_search]), params[:family_page], params[:per_page]),
      provider_merchants: group(search(provider_merchants, params[:provider_search]), params[:provider_page], params[:per_page]),
      unlinked: unlinked.map { |merchant| row(merchant) },
      counts: { family: family_merchants.count, provider: provider_merchants.count, unlinked: unlinked.count },
      enhance: { eligible_count: provider_merchants.where(website_url: [ nil, "" ]).count, llm_available: Provider::Registry.get_provider(:openai).present? },
      colors: FamilyMerchant::COLORS
    }
  end

  def form(merchant)
    { merchant: row(merchant).merge(website_url: merchant.website_url), colors: FamilyMerchant::COLORS }
  end

  def row(merchant)
    {
      id: merchant.id, name: merchant.name, type: merchant.type || "FamilyMerchant", color: merchant.color,
      logo_url: Setting.transform_brand_fetch_url(merchant.logo_url),
      source: merchant.is_a?(ProviderMerchant) ? merchant.source : nil,
      transactions_href: "/transactions?#{ { q: { merchants: [ merchant.name ] } }.to_query }",
      edit_href: "/family_merchants/#{merchant.id}/edit", destroy_href: "/api/v1/merchants/#{merchant.id}"
    }
  end

  private
    def search(scope, value)
      return scope unless value.is_a?(String) && value.strip.present?

      scope.where("LOWER(name) LIKE ?", "%#{ActiveRecord::Base.sanitize_sql_like(value.strip.downcase)}%")
    end

    def group(scope, page, per_page)
      limit = per_page.to_i.in?(1..100) ? per_page.to_i : 25
      count = scope.count
      pages = [ (count.to_f / limit).ceil, 1 ].max
      current_page = page.to_i.clamp(1, pages)
      records = scope.offset((current_page - 1) * limit).limit(limit).to_a
      { items: records.map { |merchant| row(merchant) }, page: current_page, per_page: limit, total_pages: pages, total_count: count, item_count: records.size }
    end
end
