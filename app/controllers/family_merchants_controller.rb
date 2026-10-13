class FamilyMerchantsController < ApplicationController
  before_action :set_merchant, only: %i[edit update destroy]

  def index
    @breadcrumbs = [ [ t("breadcrumbs.home"), root_path ], [ t("breadcrumbs.merchants"), nil ] ]

    # Show all merchants for this family
    @all_family_merchants = Current.family.merchants.alphabetically
    @all_provider_merchants = Current.family.assigned_merchants_for(Current.user).where(type: "ProviderMerchant").alphabetically

    family_scope = @all_family_merchants
    if params[:family_search].is_a?(String) && params[:family_search].strip.present?
      family_scope = family_scope.where("LOWER(name) LIKE ?", "%#{ActiveRecord::Base.sanitize_sql_like(params[:family_search].strip.downcase)}%")
    end

    provider_scope = @all_provider_merchants
    if params[:provider_search].is_a?(String) && params[:provider_search].strip.present?
      provider_scope = provider_scope.where("LOWER(name) LIKE ?", "%#{ActiveRecord::Base.sanitize_sql_like(params[:provider_search].strip.downcase)}%")
    end

    # Show recently unlinked ProviderMerchants (within last 30 days)
    # Exclude merchants that are already assigned to transactions (they appear in provider_merchants)
    recently_unlinked_ids = FamilyMerchantAssociation
      .where(family: Current.family)
      .recently_unlinked
      .pluck(:merchant_id)
    assigned_ids = @all_provider_merchants.pluck(:id)
    @unlinked_merchants = ProviderMerchant.where(id: recently_unlinked_ids - assigned_ids).alphabetically

    @enhanceable_count = @all_provider_merchants.where(website_url: [ nil, "" ]).count
    @llm_available = Provider::Registry.get_provider(:openai).present?

    @pagy_family_merchants, @family_merchants = pagy(family_scope, page_param: :family_page, limit: safe_per_page)
    @pagy_provider_merchants, @provider_merchants = pagy(provider_scope, page_param: :provider_page, limit: safe_per_page)

    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json do
        render json: {
          family_merchants: merchant_group(@family_merchants, @pagy_family_merchants),
          provider_merchants: merchant_group(@provider_merchants, @pagy_provider_merchants),
          unlinked: @unlinked_merchants.map { |merchant| merchant_row_json(merchant) },
          counts: {
            family: @all_family_merchants.count,
            provider: @all_provider_merchants.count,
            unlinked: @unlinked_merchants.count
          },
          enhance: { eligible_count: @enhanceable_count, llm_available: @llm_available },
          colors: FamilyMerchant::COLORS
        }
      end
    end
  end

  def new
    @family_merchant = FamilyMerchant.new(family: Current.family)

    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json { render json: { merchant: merchant_form_json(@family_merchant), colors: FamilyMerchant::COLORS } }
    end
  end

  def create
    @family_merchant = FamilyMerchant.new(merchant_params.merge(family: Current.family))

    if @family_merchant.save
      respond_to do |format|
        format.html { redirect_to family_merchants_path, notice: t(".success") }
        format.turbo_stream { render turbo_stream: turbo_stream.action(:redirect, family_merchants_path) }
        format.json { render json: merchant_json(@family_merchant), status: :created }
      end
    else
      respond_to do |format|
        # No explicit format.turbo_stream branch: Turbo's form submissions send an
        # Accept header that prefers turbo-stream, but forcing that format here would
        # lock the response's Content-Type to turbo-stream while still rendering the
        # plain :new HTML template — Turbo's client then sees a turbo-stream
        # Content-Type with no <turbo-stream> tags in the body and does nothing.
        # Leaving turbo-stream undeclared lets Rails' content negotiation fall back to
        # format.html below, which renders :new with the correct text/html type.
        format.html { redirect_to family_merchants_path, alert: @family_merchant.errors.full_messages.to_sentence, status: :see_other }
        format.json { render json: { errors: @family_merchant.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  def edit
    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json do
        render json: {
          merchant: merchant_row_json(@merchant).merge(website_url: @merchant.website_url),
          colors: FamilyMerchant::COLORS
        }
      end
    end
  end

  def update
    if @merchant.is_a?(ProviderMerchant)
      if merchant_params[:name].present? && merchant_params[:name] != @merchant.name
        # Name changed — convert ProviderMerchant to FamilyMerchant for this family only
        @family_merchant = @merchant.convert_to_family_merchant_for(Current.family, merchant_params)
        respond_to do |format|
          format.html { redirect_to family_merchants_path, notice: t(".converted_success") }
          format.turbo_stream { render turbo_stream: turbo_stream.action(:redirect, family_merchants_path) }
          format.json { render json: merchant_row_json(@family_merchant), status: :ok }
        end
      else
        # Only website changed — update the ProviderMerchant directly
        @merchant.update!(merchant_params.slice(:website_url))
        @merchant.generate_logo_url_from_website!
        respond_to do |format|
          format.html { redirect_to family_merchants_path, notice: t(".success") }
          format.turbo_stream { render turbo_stream: turbo_stream.action(:redirect, family_merchants_path) }
          format.json { render json: merchant_row_json(@merchant.reload), status: :ok }
        end
      end
    elsif @merchant.update(merchant_params)
      respond_to do |format|
        format.html { redirect_to family_merchants_path, notice: t(".success") }
        format.turbo_stream { render turbo_stream: turbo_stream.action(:redirect, family_merchants_path) }
        format.json { render json: merchant_row_json(@merchant.reload), status: :ok }
      end
    else
      respond_to do |format|
        format.html { redirect_to family_merchants_path, alert: @merchant.errors.full_messages.to_sentence, status: :see_other }
        format.json { render json: { errors: @merchant.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  rescue ActiveRecord::RecordInvalid => e
    @family_merchant = e.record.is_a?(Merchant) ? e.record : @merchant
    respond_to do |format|
      format.html { redirect_to family_merchants_path, alert: @family_merchant.errors.full_messages.to_sentence, status: :see_other }
      format.json { render json: { errors: @family_merchant.errors.full_messages }, status: :unprocessable_entity }
    end
  end

  def destroy
    if @merchant.is_a?(ProviderMerchant)
      # Unlink from family's transactions only (don't delete the global merchant)
      @merchant.unlink_from_family(Current.family)
      respond_to do |format|
        format.html { redirect_to family_merchants_path, notice: t(".unlinked_success") }
        format.json { render json: { ok: true, unlinked: true }, status: :ok }
      end
    else
      @merchant.destroy!
      respond_to do |format|
        format.html { redirect_to family_merchants_path, notice: t(".success") }
        format.json { render json: { ok: true, unlinked: false }, status: :ok }
      end
    end
  end

  def enhance
    cache_key = "enhance_provider_merchants:#{Current.family.id}"

    already_running = !Rails.cache.write(cache_key, true, expires_in: 10.minutes, unless_exist: true)

    if already_running
      respond_to do |format|
        format.html { redirect_to family_merchants_path, alert: t(".already_running") }
        format.json { render json: { ok: false, already_running: true }, status: :unprocessable_entity }
      end
      return
    end

    EnhanceProviderMerchantsJob.perform_later(Current.family)
    respond_to do |format|
      format.html { redirect_to family_merchants_path, notice: t(".success") }
      format.json { render json: { ok: true }, status: :ok }
    end
  end

  def merge
    @merchants = all_family_merchants

    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json do
        render json: {
          merchants: @merchants.map { |merchant| merchant_row_json(merchant) },
          colors: FamilyMerchant::COLORS
        }
      end
    end
  end

  def perform_merge
    # Scope lookups to merchants valid for this family (FamilyMerchants + assigned ProviderMerchants)
    valid_merchants = all_family_merchants

    target = valid_merchants.find_by(id: params[:target_id])
    unless target
      respond_to do |format|
        format.html { redirect_to merge_family_merchants_path, alert: t(".target_not_found") }
        format.json { render json: { errors: [ t(".target_not_found") ] }, status: :unprocessable_entity }
      end
      return
    end

    sources = valid_merchants.where(id: params[:source_ids])
    unless sources.any?
      respond_to do |format|
        format.html { redirect_to merge_family_merchants_path, alert: t(".invalid_merchants") }
        format.json { render json: { errors: [ t(".invalid_merchants") ] }, status: :unprocessable_entity }
      end
      return
    end

    merger = Merchant::Merger.new(
      family: Current.family,
      target_merchant: target,
      source_merchants: sources
    )

    if merger.merge!
      respond_to do |format|
        format.html { redirect_to family_merchants_path, notice: t(".success", count: merger.merged_count) }
        format.json { render json: { ok: true, merged_count: merger.merged_count }, status: :ok }
      end
    else
      respond_to do |format|
        format.html { redirect_to merge_family_merchants_path, alert: t(".no_merchants_selected") }
        format.json { render json: { errors: [ t(".no_merchants_selected") ] }, status: :unprocessable_entity }
      end
    end
  rescue Merchant::Merger::UnauthorizedMerchantError => e
    respond_to do |format|
      format.html { redirect_to merge_family_merchants_path, alert: e.message }
      format.json { render json: { errors: [ e.message ] }, status: :unprocessable_entity }
    end
  end

  private
    def set_merchant
      # Find merchant that either belongs to family OR is assigned to family's transactions
      @merchant = Current.family.merchants.find_by(id: params[:id]) ||
                  Current.family.assigned_merchants.find(params[:id])
      @family_merchant = @merchant # For backwards compatibility with views
    end

    def merchant_params
      # Handle both family_merchant and provider_merchant param keys
      key = params.key?(:family_merchant) ? :family_merchant : :provider_merchant
      params.require(key).permit(:name, :color, :website_url)
    end

    def merchant_json(merchant)
      merchant.as_json(only: %i[id name]).merge(
        html: render_to_string(
          partial: "DS/merchant_select/option",
          formats: [ :html ],
          locals: { merchant: merchant, selected: true, view_helpers: helpers }
        )
      )
    end

    def merchant_row_json(merchant)
      {
        id: merchant.id,
        name: merchant.name,
        type: merchant.type,
        color: merchant.is_a?(FamilyMerchant) ? merchant.read_attribute(:color) : nil,
        logo_url: merchant.logo_url,
        source: merchant.is_a?(ProviderMerchant) ? merchant.source : nil,
        transactions_href: transactions_path(q: { merchants: [ merchant.name ] }),
        edit_href: edit_family_merchant_path(merchant),
        destroy_href: family_merchant_path(merchant)
      }
    end

    def merchant_form_json(merchant)
      {
        id: merchant.persisted? ? merchant.id : nil,
        name: merchant.name,
        color: merchant.is_a?(FamilyMerchant) ? merchant.read_attribute(:color) : nil,
        website_url: merchant.website_url,
        type: merchant.type || "FamilyMerchant"
      }
    end

    def merchant_group(records, pagy)
      {
        items: records.map { |merchant| merchant_row_json(merchant) },
        page: pagy.page,
        per_page: pagy.limit,
        total_pages: pagy.pages,
        total_count: pagy.count,
        item_count: records.size
      }
    end

    def all_family_merchants
      family_merchant_ids = Current.family.merchants.pluck(:id)
      provider_merchant_ids = Current.family.assigned_merchants.where(type: "ProviderMerchant").pluck(:id)
      combined_ids = (family_merchant_ids + provider_merchant_ids).uniq

      Merchant.where(id: combined_ids)
              .order(Arel.sql("LOWER(COALESCE(name, ''))"))
    end
end
