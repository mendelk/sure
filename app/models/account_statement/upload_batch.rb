# frozen_string_literal: true

# The vault's partial-success upload workflow is shared by HTML and API clients.
class AccountStatement::UploadBatch
  Result = Data.define(:created, :duplicates, :validation_errors)

  def self.call(family:, account:, files:)
    created = []
    duplicates = []
    validation_errors = []

    files.each do |file|
      prepared_upload = AccountStatement.prepare_upload!(file)
      created << AccountStatement.create_from_prepared_upload!(family: family, account: account, prepared_upload: prepared_upload)
    rescue AccountStatement::InvalidUploadError
      validation_errors << I18n.t("account_statements.create.invalid_file_type")
    rescue AccountStatement::DuplicateUploadError => e
      duplicates << e.statement
    rescue ActiveRecord::RecordInvalid => e
      validation_errors << e.record.errors.full_messages.to_sentence
    end

    Result.new(created:, duplicates:, validation_errors:)
  end
end
