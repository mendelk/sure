class Api::V1::ProviderReplacementsController < Api::V1::BaseController
  before_action :ensure_read_scope, only: :show
  before_action :ensure_write_scope, only: %i[preview apply]

  include ProviderReplacementActions
end
