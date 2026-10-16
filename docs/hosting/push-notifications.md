# Push notifications

## Web notifications: desktop and mobile browsers

Web notifications work in hosted and self-hosted deployments. They are separate
from native iOS/APNs notifications below and do not require Apple credentials.
The persistent inbox works without browser permission or configured push keys.

### Server and worker configuration

Apply the database migrations with the normal deployment migration step. Configure
these variables identically on Rails web processes and Sidekiq workers:

| Variable | Purpose |
| --- | --- |
| `WEB_PUSH_PUBLIC_KEY` | VAPID public key, shared with enrolled browsers |
| `WEB_PUSH_PRIVATE_KEY` | VAPID private key; keep server-side in the secret store |
| `WEB_PUSH_SUBJECT` | Operator contact, such as `mailto:admin@example.com` or an HTTPS URL |

Generate a key pair once:

```sh
bin/rails runner 'key = WebPush.generate_key; puts "WEB_PUSH_PUBLIC_KEY=#{key.public_key}"; puts "WEB_PUSH_PRIVATE_KEY=#{key.private_key}"'
```

Keep the pair stable across deployments; replacing it requires browser
re-enrollment. The Compose examples forward all three variables to web and worker
processes. Existing Active Record encryption configuration protects stored
subscription credentials. Do not log browser subscription endpoints or keys.

Workers must consume the `scheduled` queue, have Redis connectivity, and load
`config/schedule.yml`. `WebNotificationSweepJob` runs every minute, collecting
eligible events and recovering committed delivery records after enqueue failures.
Allow outbound HTTPS to the supported browser push services: Firebase Cloud
Messaging, Mozilla Push, Apple Web Push, and Microsoft WNS.

### Opt in and enroll a browser

1. Enable preview features for your user.
2. Open **Settings → Notification settings**, enable web notifications, choose
   event/account filters, and save.
3. Choose **Enable this browser**, then approve the browser permission prompt.
4. Choose **Send test to this browser** and confirm the alert on that device.

Enrollment requires HTTPS, except secure localhost development contexts. Permission
is requested only after choosing the enrollment button. On iPhone/iPad, use Safari
on iOS/iPadOS 16.4 or later, add Sure to the Home Screen, and launch that installed
web app before enrolling. Android and desktop delivery depend on browser support,
site permission, and operating-system notification settings.

Each browser registers separately. The device list supports revocation, and logout
removes registrations bound to that login session. Returning with a different user
cannot inherit the previous user's registration. Explicitly revoked registrations
are not silently restored by visiting the app.

### Events, privacy, and delivery

The inbox is available from the account menu's **Notifications** entry or the
notification settings page. It supports unread/read filters and marking individual
notifications or the whole inbox read.

Supported events are new transactions, statements becoming ready, upcoming and
overdue bills, bank connections requiring action, and budget-category thresholds.
Initial provider history establishes a silent baseline; replaying history, imports,
or pending-to-posted reconciliation does not create duplicate arrival alerts.
New transactions are grouped by account and currency. Pending activity is excluded
unless selected, and minimum absolute amounts are evaluated in each transaction's
currency without conversion.

Event/account filters apply per user, not per household. Access is checked again
when viewing the inbox and sending a push. Browser alerts hide financial details
by default; enabling details can expose account names on lock screens or shared
devices. Daily digests and quiet hours delay browser delivery, not inbox creation,
and use the household time zone. Test notifications bypass these delays and are
limited to the currently enrolled browser, with a one-minute cooldown.

### Troubleshooting

- **Inbox works, browser enrollment unavailable:** configure the VAPID variables
  on both web and worker processes and deploy them with the same key pair.
- **No new transaction alert:** confirm preview and notification opt-ins, account
  and event filters, minimum amounts, pending settings, and a successful account
  sync. Initial history and activity observed before opt-in are intentionally silent.
- **Queued / retrying:** check the worker, scheduler, Redis, quiet hours, and digest
  schedule. Temporary transport failures, HTTP 429, and HTTP 5xx have bounded retries.
- **Accepted:** the browser push service accepted the message; this does not prove
  that the browser or operating system displayed it. Check device permissions and
  focus/do-not-disturb settings on the receiving device.
- **Expired / disabled browser:** HTTP 404/410 disables the stale registration.
  Re-enroll that browser explicitly. Use **Revoke browser** to remove a lost device.

## Hosted native iOS notifications

Native push notifications are supported only in hosted mode, which Rails calls
`managed`. `SELF_HOSTED=true` or `SELF_HOSTING_ENABLED=true` disables registration,
unregistration, diagnostic controls, and APNs delivery. Existing tokens and
configured Apple credentials do not override that restriction.

### Server and worker configuration

Set the following in the deployment secret store for both Rails web processes
and Sidekiq workers:

| Variable | Purpose |
| --- | --- |
| `APNS_KEY_ID` | Apple APNs signing key ID |
| `APNS_TEAM_ID` | Apple Developer team owning the app |
| `APNS_BUNDLE_ID` | Official iOS app topic: `am.sure.insights` |
| `APNS_PRIVATE_KEY_BASE64` | Base64-encoded APNs `.p8` private key; keep server-side |
| `APNS_ENABLED` | Set to `false` to stop push delivery after web/worker processes load the updated environment; defaults to enabled when configured |
| `REDIS_URL` | Shared Redis for Sidekiq and Rails diagnostic cache |

Base64 does not encrypt the signing key. Do not embed it in the iOS app, logs, or
repository. Configure the same shared Rails Redis cache on web and worker
processes; a process-local memory/null cache cannot coordinate these diagnostics.
Workers must consume the existing `scheduled` queue and reach the sandbox and
production APNs endpoints over HTTP/2/TLS. No additional gem or database migration
is needed for the System Health diagnostic.

Verify Push Notifications is enabled for the app's Apple App ID. Inspect the
entitlements of the signed development and TestFlight artifacts, and verify their
APNs environments. Registrations select `sandbox` or `production` per device.

### Send a diagnostic notification

1. Sign into the Sure iOS app with the same hosted account as the super-admin
   signed into the web app, and enable push notifications.
2. Open **System Health → Background jobs → Push notifications** in the web app.
3. Select **Send test push notification**. This sends only to that account's
   recently registered iOS devices; no recipient can be selected in the request.
4. Select **Refresh results** to see each device's outcome. Results remain for
   24 hours. **Accepted by APNs** confirms Apple's acceptance, not presentation
   on the device. Confirm the alert on a development device and a TestFlight build.

The button is disabled when there is no current registration, APNs is unconfigured,
delivery is disabled, or another test was requested in the last 30 seconds. A
registration currently counts as enabled until it is removed or becomes stale;
iOS permission changes must be synchronized by the app. This server-side state
cannot prove the current device permission while the device is offline.

Tests run through Sidekiq, one job per device, with generic localized text and no
financial information. They do not create an insight or require insight preview
access. Requests older than 15 minutes are skipped. Ordinary job replays reuse a
terminal diagnostic result; this short-lived cache is not an exactly-once delivery
guarantee. A lost cache entry prevents a diagnostic send rather than inventing a
recipient from stale arguments.

### Outcomes and troubleshooting

- **Queued / retrying:** check worker availability and the `scheduled` queue.
- **Skipped:** eligibility, ownership, role, mode, configuration, or freshness
  changed after the test was requested.
- **Rejected by APNs:** check the `push_notifications` category in Debug logs.
  Verify bundle ID, key/team, and device environment; `BadDeviceToken` may indicate
  an environment mismatch. Raw tokens and APNs response bodies are not recorded.
- **Device registration is no longer valid:** the worker received APNs `410`.
  Removal is conditional on the registration not being renewed in the meantime.
- **Could not enqueue:** check Sidekiq/Redis availability and submit again after
  the cooldown. No device send occurred for that result.
- **Expired without a final result:** the request outlived the send window without
  a completed outcome; check worker connectivity and request a fresh test.

Only temporary connection errors, HTTP 429, and HTTP 5xx responses receive the
explicit bounded retry policy. Configuration and other APNs rejections are surfaced
for operator correction. Each send has connection and response timeouts, and test
notifications expire at APNs after five minutes.

Normal insight notifications require an active user, current registration, preview
opt-in, and a high-priority active insight at execution time. The diagnostic checks
active super-admin status and device ownership again in the worker. Disabling
push delivery stops both paths, while registration remains available in hosted mode
so a temporary delivery outage does not prevent token renewal.

### Remaining release work

The Swift app still needs periodic registration renewal (Rails currently excludes
registrations older than 90 days), account-bound lifecycle recovery, visible
registration error state, and navigation for insight/test notification taps.
Durable insight delivery tracking and recovery across enqueue failures are a
separate implementation step. Provisioning and live sandbox/TestFlight acceptance
must be completed before declaring push delivery ready for rollout.
