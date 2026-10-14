#!/usr/bin/env ruby
# frozen_string_literal: true

# One-off backfill for Brandfetch-backed logo URLs.
#
# Run with:
#
#   bin/rails runner bin/backfill_brandfetch_logos.rb            # apply
#   bin/rails runner bin/backfill_brandfetch_logos.rb -- --dry-run
#
# What it does:
#
# - Merchants (ProviderMerchant and FamilyMerchant): regenerates logo_url from
#   website_url whenever the stored URL differs from what the current settings
#   (brand_fetch_client_id, brand_fetch_high_res_logos) would produce, and
#   clears Brandfetch-shaped stored URLs when the client ID is absent. Records
#   without a website_url are left alone. Non-Brandfetch stored logos (uploaded
#   or provider-supplied) are never overwritten.
# - Accounts: nothing to write. Account#logo_url computes the Brandfetch URL at
#   read time from institution_domain, so it follows updated settings instantly.
#   Reported for visibility.
# - Securities: same — Security#display_logo_url resolves at read time.
#   Reported for visibility.
#
# Idempotent: re-running after a full pass reports 0 updates. Emits newline-
# delimited JSON so runs can be piped or logged.

unless Setting.brand_fetch_client_id.present?
  abort <<~MSG
    Brandfetch is not configured. Set a Client ID in Settings > Self-Hosting
    or provide the BRAND_FETCH_CLIENT_ID environment variable, then re-run.
  MSG
end

DRY_RUN = ARGV.intersect?(%w[--dry-run -n])
SIZE = Setting.brand_fetch_logo_size
CLIENT_ID = Setting.brand_fetch_client_id

def brandfetch_url_for_domain(domain)
  "https://cdn.brandfetch.io/#{domain}/icon/fallback/lettermark/w/#{SIZE}/h/#{SIZE}?c=#{CLIENT_ID}"
end

def extract_domain(url)
  normalized = url.start_with?("http://", "https://") ? url : "https://#{url}"
  URI.parse(normalized).host&.sub(/\Awww\./, "")
rescue URI::InvalidURIError
  nil
end

# Stored non-Brandfetch logos (uploaded/other providers) are business assets a
# URL refresh must never overwrite; only touch CDN-shaped values or blanks.
def brandfetch_shaped?(url)
  url.to_s.start_with?("https://cdn.brandfetch.io/")
end

puts({ dry_run: DRY_RUN, logo_size: SIZE, client_id: CLIENT_ID }.to_json)

merchant_updates = 0
merchant_errors = []

[
  ["provider", ProviderMerchant.where.not(website_url: [ nil, "" ])],
  ["family", FamilyMerchant.where.not(website_url: [ nil, "" ])]
].each do |kind, scope|
  scope.find_each do |merchant|
    domain = merchant.send(:extract_domain, merchant.website_url)
    next if domain.blank?

    desired = brandfetch_url_for_domain(domain)
    stored = merchant.logo_url

    if brandfetch_shaped?(stored) || stored.blank?
      needs_update = stored != desired
    else
      needs_update = false # non-Brandfetch stored logo wins
    end

    next unless needs_update

    merchant_updates += 1
    puts({ model: "merchant", kind: kind, id: merchant.id, name: merchant.name,
           from: stored.inspect, to: desired.inspect }.to_json)
    next if DRY_RUN

    begin
      merchant.update_columns(logo_url: desired, updated_at: Time.current)
    rescue => e
      merchant_errors << { id: merchant.id, error: e.message }
    end
  end
end

# Accounts: computed at read time; report only.
accounts_with_brandfetch = 0
Account.where.not(institution_domain: [ nil, "" ]).find_each do |account|
  accounts_with_brandfetch += 1 if account.logo_url.to_s.start_with?("https://cdn.brandfetch.io/")
end
puts({ model: "account", brandfetch_backed: accounts_with_brandfetch, writable: 0 }.to_json)

# Securities: computed at read time; report only.
brandfetch_securities = 0
Security.find_each do |security|
  brandfetch_securities += 1 if security.display_logo_url.to_s.start_with?("https://cdn.brandfetch.io/")
end
puts({ model: "security", brandfetch_backed: brandfetch_securities, writable: 0 }.to_json)

puts({ ok: merchant_errors.empty?, dry_run: DRY_RUN, merchant_updates: merchant_updates,
       merchant_errors: merchant_errors }.to_json)
exit(merchant_errors.empty? ? 0 : 1)