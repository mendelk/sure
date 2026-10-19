module AccountAuthorizable
  extend ActiveSupport::Concern

  included do
    include StreamExtensions
    helper_method :account_permissions
  end

  private

    def account_permissions(account)
      @viewer_account_permissions ||= {}
      @viewer_account_permissions[account.id] ||= begin
        permission = if account.owned_by?(Current.user)
          "owner"
        else
          @viewer_share_permissions ||= AccountShare.where(user: Current.user).pluck(:account_id, :permission).to_h
          @viewer_share_permissions[account.id]
        end
        {
          can_edit: permission.in?(%w[owner full_control]),
          can_annotate: permission == "owner" || permission.in?(AccountShare::ANNOTATE_PERMISSIONS)
        }
      end
    end

    def require_account_permission!(account, level = :write, redirect_path: nil)
      permission = account.permission_for(Current.user)

      allowed = case level
      when :write    then permission.in?([ :owner, :full_control ])
      when :annotate then permission == :owner || permission.to_s.in?(AccountShare::ANNOTATE_PERMISSIONS)
      when :owner    then permission == :owner
      else false
      end

      return true if allowed

      path = redirect_path || account_path(account)
      respond_to do |format|
        format.html { redirect_back_or_to path, alert: t("accounts.not_authorized") }
        format.turbo_stream { stream_redirect_back_or_to(path, alert: t("accounts.not_authorized")) }
        format.json { render json: { error: t("accounts.not_authorized") }, status: :forbidden }
      end
      false
    end
end
