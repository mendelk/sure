class SplitsController < ApplicationController
  before_action :set_entry
  before_action :require_split_write_permission!, only: %i[create update destroy]

  def new
    @categories = grouped_categories
    @transfer_accounts = transfer_account_options
  end

  def create
    unless @entry.transaction.splittable?
      redirect_back_or_to transactions_path, alert: t("splits.create.not_splittable")
      return
    end

    splits = build_splits_with_transfers
    return if performed?

    @entry.split!(splits)
    sync_split_accounts(splits)

    redirect_back_or_to transactions_path, notice: t("splits.create.success")
  rescue ActiveRecord::RecordInvalid => e
    redirect_back_or_to transactions_path, alert: e.message
  end

  def edit
    resolve_to_parent!

    unless @entry.split_parent?
      redirect_to transactions_path, alert: t("splits.edit.not_split")
      return
    end

    @categories = grouped_categories
    @transfer_accounts = transfer_account_options
    @children = @entry.child_entries.includes(entryable: [ :transfer_as_inflow, :transfer_as_outflow ])
  end

  def update
    resolve_to_parent!

    unless @entry.split_parent?
      redirect_to transactions_path, alert: t("splits.edit.not_split")
      return
    end

    splits = build_splits_with_transfers
    return if performed?

    transfer_account_ids_before = @entry.child_entries.includes(entryable: [ :transfer_as_inflow, :transfer_as_outflow ]).flat_map do |child|
      transfer = child.entryable.try(:transfer)
      next [] if transfer.nil?
      [ transfer.from_account&.id, transfer.to_account&.id ]
    end

    Entry.transaction do
      @entry.unsplit!
      @entry.split!(splits)
    end

    sync_split_accounts(splits, extra_account_ids: transfer_account_ids_before)

    redirect_to transactions_path, notice: t("splits.update.success")
  rescue ActiveRecord::RecordInvalid => e
    redirect_to transactions_path, alert: e.message
  end

  def destroy
    resolve_to_parent!

    unless @entry.split_parent?
      redirect_to transactions_path, alert: t("splits.edit.not_split")
      return
    end

    transfer_account_ids = @entry.child_entries.includes(entryable: [ :transfer_as_inflow, :transfer_as_outflow ]).flat_map do |child|
      transfer = child.entryable.try(:transfer)
      next [] if transfer.nil?
      [ transfer.from_account&.id, transfer.to_account&.id ]
    end

    @entry.unsplit!
    @entry.sync_account_later
    transfer_account_ids.compact.uniq.each do |account_id|
      account = Current.family.accounts.find_by(id: account_id)
      account&.sync_later
    end

    redirect_to transactions_path, notice: t("splits.destroy.success")
  end

  private

    def set_entry
      @entry = Current.accessible_entries.find(params[:transaction_id])
    end

    def require_split_write_permission!
      require_account_permission!(@entry.account, redirect_path: transactions_path)
    end

    def resolve_to_parent!
      @entry = @entry.parent_entry if @entry.split_child?
    end

    def split_params
      params.require(:split).permit(splits: [ :name, :amount, :category_id, :excluded, :transfer_account_id ])
    end

    def grouped_categories
      Current.family.categories.alphabetically_by_hierarchy
    end

    def transfer_account_options
      Current.family.accounts.visible.alphabetically.where.not(id: @entry.account_id)
    end

    def build_splits_with_transfers
      raw_splits = split_params[:splits]
      raw_splits = raw_splits.values if raw_splits.respond_to?(:values)

      transfer_ids = raw_splits.filter_map { |s| s[:transfer_account_id].presence }.uniq
      accounts_by_id = {}
      if transfer_ids.any?
        accounts = Current.family.accounts.where(id: transfer_ids).index_by(&:id)
        if accounts.size != transfer_ids.size
          redirect_back_or_to transactions_path, alert: t("splits.create.invalid_transfer_account")
          return nil
        end
        transfer_ids.each do |account_id|
          account = accounts[account_id]
          unless require_account_permission!(account, redirect_path: transactions_path)
            return nil
          end
          if account.id == @entry.account_id
            redirect_back_or_to transactions_path, alert: t("splits.create.invalid_transfer_account")
            return nil
          end
        end
        accounts_by_id = accounts
      end

      raw_splits.map do |s|
        transfer_account = s[:transfer_account_id].present? ? accounts_by_id[s[:transfer_account_id].to_s] : nil
        {
          name: s[:name],
          amount: s[:amount].to_d * -1,
          category_id: s[:category_id].presence,
          excluded: s[:excluded],
          transfer_account: transfer_account
        }
      end
    end

    def sync_split_accounts(splits, extra_account_ids: [])
      @entry.sync_account_later
      account_ids = splits.filter_map { |s| s[:transfer_account]&.id } + Array(extra_account_ids)
      account_ids.compact.uniq.each do |account_id|
        next if account_id == @entry.account_id
        account = Current.family.accounts.find_by(id: account_id)
        account&.sync_later
      end
    end
end
