# Bills and Recurring Transactions

This document explains how Sure detects recurring bills, when the detection
pipeline runs, and the maintenance tasks available to self-hosters.

## How detection works

Sure clusters your transaction history into recurring patterns (same
merchant or name, consistent amount within tolerance, consistent day). A
pattern needs at least three consistent occurrences to become a series.
New detections land with status `suggested` and wait in a review strip on
the Bills page (and under Settings -> Recurring transactions) until you
confirm or dismiss them. Dismissing leaves a tombstone, so a dismissed
pattern is never suggested again.

## When the pipeline runs

The full pipeline (detect patterns, materialize upcoming occurrences,
repair provider-replaced entries, match payments, detect price changes)
runs automatically:

- after every completed bank sync or import (debounced by 30 seconds)
- nightly at 05:30 UTC (occurrence materialization and credit-card estimate
  refresh, for families that never sync)

And on demand:

- the **Find recurring transactions** button on an empty Bills page
- the **Identify Patterns** button under Settings -> Recurring transactions

All triggers share one per-family lock, so concurrent runs never stack.

## First run on existing data

The user-triggered detection actions (the **Find recurring transactions**
button on an empty Bills page and the **Identify Patterns** button under
Settings -> Recurring transactions) backfill the last six months of
history: past occurrences are generated and closed as paid where a real
transaction anchors them. Past occurrences no transaction covers are
deleted rather than shown as missed, so the backfill reconstructs what
happened without fabricating debt. The backfill is idempotent, so
re-running detection never duplicates history. Background syncs never
backfill; on an instance upgraded from a build without the Bills
subsystem, run either detection action once to reconstruct history.

Confirming an individual suggestion likewise backfills that bill's own
history, so a just-confirmed bill shows its lived past instead of
starting blank.

## Automatic credit-card payments

Each visible **Credit Card** account has one system-managed monthly payment
series. Ordinary Loan accounts do not use this feature. New cards get their
series automatically; existing cards are picked up by the nightly job, sync
pipeline, or the first Bills visit. Bills remains a preview feature.

Set **Payment due day** (1–31) in the credit-card account's settings. Short
months use their last day. Leaving it blank asks Sure to infer a day from
posted repayments: at least three distinct months with one recognizable
repayment each, a repeated modal day, and at least 80% within two days of that
day (month-end dates are treated together). Multiple payments in a month do
not establish a deadline. Payment history estimates a payment day, **not a
bank-confirmed deadline**; enter the bank's actual day when known.

Statement close currently defaults to **25 days before payment**, using
`CreditCard::PaymentSchedule::STATEMENT_GAP_DAYS`. This is an assumption,
not a bank-specific or statement-confirmed date. An occurrence is generated
only after its estimated closing date has passed; future amounts are not
projected from past payments. The first run starts at the latest closed
cycle rather than inventing missed historical bills. Changing the due day
applies to newly generated cycles; existing cycles keep their dates and
statement boundaries.

The estimate is the **full outstanding statement debt, not the minimum
payment**. It includes carried debt and posted charges, fees, and interest
through the estimated close. Reconciled daily balances in the account's
currency take precedence over opening-valuation reconstruction, which can
be inaccurate when a linked account has incomplete imported history.
Pending transactions and later-cycle purchases are excluded. Repayments and
post-close credits are matched in the account's currency. Confirmed repayments
reduce what remains; later refunds and other non-payment credits reduce the
outstanding estimate.
The nightly job keeps refreshing unpaid cycles. Carried debt and credits
are not billed twice when multiple cycles remain unpaid; settled payment
history is preserved. The displayed post-close credit total describes credits
since that particular close, so totals from overlapping cycles must not be
added together.

Users cannot edit, pause, delete, skip, snooze, or override this managed
schedule through the web app, API, or assistant. They can still record
payments, mark a cycle paid, and unlink an incorrectly matched payment.
Unlinking prevents that entry being automatically attached again.
Disabling a card hides its payment series from payable views and stops new
cycles until the card is active again.

Existing recurring payment patterns into the card are ended and replaced by
the managed series, retaining their historical payments. Account entries
and transfers are not rewritten or deleted. Payments already recorded on
the older series still reduce the new estimate.

### API fields and deployment

Deployments must run the `AddManagedCreditCardPayments` database migration.
The existing account update endpoint accepts:

```json
{
  "account": {
    "accountable": {
      "payment_due_day": 9
    }
  }
}
```

Send `payment_due_day: null` to return to inference. Account responses expose
`estimated_payment_due_day`, `payment_due_day_source` (`manual`, `estimated`,
or null), and `statement_gap_days`.

Recurring-transaction responses identify the series with
`system_managed_kind: "credit_card_payment"` and expose `current_occurrence`
with the estimated statement dates, closing balance, post-close credits,
expected amount, remaining amount, currency, and due-date source. The
series-level `amount` is zero bookkeeping, not an estimate: use occurrence
amounts for these series. With `upcoming=true`, only cards with a dated open
occurrence appear, and `amount` / `amount_cents` instead report that
occurrence's unpaid remainder. Unknown due days and next dates are null,
not invented dates.
Updating or deleting the series returns HTTP 403; configure the due day
through the account endpoint instead.

## Maintenance tasks

Both tasks are safe to re-run; they only close history a real entry
anchors and never touch existing payment records.

```bash
# Rebuild N months of occurrence history for every family (default 6)
bin/rails "recurring:backfill_history[12]"

# One-shot classification of auto-detected series still on defaults
# (assigns bill/subscription/installment kind and a category)
bin/rails recurring:classify_existing
```

## Disabling the feature

Settings -> Recurring transactions has a per-family toggle. Disabling
hides the Bills page and stops all detection and materialization for
that family.
