class Account::Sharing
  def initialize(account, user:)
    @account = account
    @user = user
  end

  def update_members!(members)
    raise SecurityError, "Only the account owner can change sharing" unless account.owned_by?(user)

    eligible_members = account.family.users.where.not(id: account.owner_id).where(active: true)
    AccountShare.transaction do
      members.each do |attrs|
        member = eligible_members.find_by(id: attrs[:user_id])
        next unless member

        share = account.account_shares.find_by(user: member)
        if ActiveModel::Type::Boolean.new.cast(attrs[:shared])
          permission = AccountShare::PERMISSIONS.include?(attrs[:permission]) ? attrs[:permission] : (share&.permission || "read_only")
          if share
            share.update!(permission: permission)
          else
            account.account_shares.create!(user: member, permission: permission, include_in_finances: true)
          end
        else
          share&.destroy!
        end
      end
    end
  end

  def update_finance_inclusion!(value)
    account.account_shares.find_by!(user: user).update!(include_in_finances: ActiveModel::Type::Boolean.new.cast(value))
  end

  private
    attr_reader :account, :user
end
