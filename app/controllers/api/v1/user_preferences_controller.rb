class Api::V1::UserPreferencesController < Api::V1::BaseController
  before_action -> { authorize_scope!(:write) }

  def update
    preferences = params.require(:preferences)
    raise ActionController::ParameterMissing, :preferences unless preferences.is_a?(ActionController::Parameters)

    period = preferences.permit(:default_period)[:default_period]
    unless period.is_a?(String) && Period.valid_key?(period)
      return render_validation_error("Default period is invalid")
    end

    current_resource_owner.update!(default_period: period)
    render json: { preferences: { default_period: current_resource_owner.default_period } }
  rescue ActiveRecord::RecordInvalid => error
    render_validation_error(error.record.errors.full_messages.join(", "))
  end
end
