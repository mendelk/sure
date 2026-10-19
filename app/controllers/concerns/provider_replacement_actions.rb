module ProviderReplacementActions
  extend ActiveSupport::Concern

  included do
    before_action :set_provider_replacement_account
    rescue_from Account::ProviderReplacement::Error, with: :render_provider_replacement_error
    rescue_from ActionController::ParameterMissing, with: :render_provider_replacement_parameters_error
    rescue_from ActiveRecord::RecordNotFound, with: :render_provider_replacement_not_found
  end

  def show
    return render("spa/show", layout: "spa") if request.format.html?

    render json: {
      account: @account.slice(:id, :name, :currency),
      candidates: Account::ProviderReplacement.candidates(account: @account, user: Current.user),
      text: I18n.t("simplefin_items.provider_replacement")
    }
  end

  def preview
    render json: provider_replacement.preview(matches: provider_replacement_matches)
  end

  def apply
    render json: provider_replacement.apply!(
      fingerprint: provider_replacement_scalar(:fingerprint),
      matches: provider_replacement_matches,
      idempotency_key: provider_replacement_scalar(:idempotency_key),
      accept_balance_difference: provider_replacement_balance_acceptance
    )
  end

  private
    def set_provider_replacement_account
      unless Current.user&.admin?
        render json: { error: "forbidden", message: I18n.t("shared.require_admin") }, status: :forbidden
        return
      end

      @account = Current.family.accounts.accessible_by(Current.user).find(params[:account_id])
      unless Current.family.accounts.writable_by(Current.user).exists?(@account.id)
        render json: { error: "forbidden", message: I18n.t("accounts.not_authorized") }, status: :forbidden
      end
    end

    def provider_replacement
      provider = SimplefinAccount.joins(:simplefin_item)
        .where(simplefin_items: { family_id: Current.family.id })
        .find(provider_replacement_scalar(:simplefin_account_id))
      Account::ProviderReplacement.new(account: @account, simplefin_account: provider, user: Current.user)
    end

    def provider_replacement_matches
      matches = params.fetch(:matches, [])
      unless matches.is_a?(Array) && matches.all? { |match| match.is_a?(ActionController::Parameters) }
        raise ActionController::ParameterMissing, :matches
      end

      matches.map { |match| match.permit(:incoming_id, :survivor_id).to_h.symbolize_keys }
    end

    def provider_replacement_scalar(name)
      value = params.require(name)
      raise ActionController::ParameterMissing, name unless value.is_a?(String)
      value
    end

    def provider_replacement_balance_acceptance
      value = params.fetch(:accept_balance_difference, false)
      unless value == true || value == false
        raise ActionController::ParameterMissing, :accept_balance_difference
      end
      value
    end

    def render_provider_replacement_error(error)
      render json: { error: error.code, message: error.message }, status: error.status
    end

    def render_provider_replacement_parameters_error(error)
      render json: { error: "invalid_parameters", message: error.message }, status: :unprocessable_entity
    end

    def render_provider_replacement_not_found
      render json: { error: "not_found", message: I18n.t("provider_replacements.not_found", default: "Account or provider not found") }, status: :not_found
    end
end
