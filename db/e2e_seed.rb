# frozen_string_literal: true

# Deterministic seed for the alternate-frontend e2e harness (t_alt_fnd_012).
#
# Run via:  RAILS_ENV=test bin/rails runner db/e2e_seed.rb
# Clean via: RAILS_ENV=test E2E_CLEANUP=1 bin/rails runner db/e2e_seed.rb
#
# Creates ONE family ("E2E Harness Family", found by this exact name) with:
# - member@e2e.sure.invalid (family admin, password from SURE_E2E_PASSWORD
#   or the default below) — the primary smoke user;
# - viewer@e2e.sure.invalid (family member role) — the roles-matrix user;
# - one deterministic depository account ("E2E Checking", USD 5000.00).
#
# Idempotent: re-running updates the users' passwords/roles and recreates a
# missing account instead of duplicating rows. Cleanup destroys the whole
# family, which cascades (dependent: :destroy) to users, accounts, devices,
# and tokens — the orchestrator (apps/web/scripts/e2e-services.mjs) runs
# cleanup after every smoke run so CI and local databases stay clean.
E2E_FAMILY_NAME = "E2E Harness Family"
E2E_PASSWORD = ENV.fetch("SURE_E2E_PASSWORD", "E2e-supersecret-1!")
E2E_MEMBER_EMAIL = "member@e2e.sure.invalid"
E2E_VIEWER_EMAIL = "viewer@e2e.sure.invalid"
E2E_ACCOUNT_NAME = "E2E Checking"

if ENV["E2E_CLEANUP"] == "1"
  family = Family.find_by(name: E2E_FAMILY_NAME)
  family&.destroy!
  puts "[e2e_seed] cleanup: #{family ? "destroyed #{E2E_FAMILY_NAME}" : "nothing to clean"}"
  exit 0
end

family = Family.find_or_create_by!(name: E2E_FAMILY_NAME)

member = User.find_or_initialize_by(email: E2E_MEMBER_EMAIL)
member.assign_attributes(
  family: family,
  first_name: "E2E",
  last_name: "Member",
  role: :admin,
  password: E2E_PASSWORD,
  password_confirmation: E2E_PASSWORD
)
member.save!

viewer = User.find_or_initialize_by(email: E2E_VIEWER_EMAIL)
viewer.assign_attributes(
  family: family,
  first_name: "E2E",
  last_name: "Viewer",
  role: :member,
  password: E2E_PASSWORD,
  password_confirmation: E2E_PASSWORD
)
viewer.save!

account = family.accounts.find_or_initialize_by(name: E2E_ACCOUNT_NAME)
if account.new_record?
  # NB: non-bang by design — Account.create_and_sync has no bang variant,
  # but it still raises ActiveRecord::RecordInvalid via save! inside.
  family.accounts.create_and_sync(
    {
      name: E2E_ACCOUNT_NAME,
      balance: 5000,
      currency: family.currency,
      owner: member,
      accountable_type: "Depository",
      accountable_attributes: { subtype: "checking" }
    }
  )
end

puts "[e2e_seed] family=#{family.id} member=#{member.email} viewer=#{viewer.email} account=#{E2E_ACCOUNT_NAME}"
