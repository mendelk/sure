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

Each visible **Credit Card** account with an explicitly configured **Payment due
day** has one system-managed monthly payment series. Ordinary Loan accounts do
not use this feature. Configured cards get their series automatically; existing
cards are refreshed by the nightly job, sync pipeline, or the first Bills visit.
Bills remains a preview feature.

Set **Payment due day** (1–31) in the credit-card account's settings. Short months
use their last day. Leaving it blank disables automatic statement payments;
payment history never supplies a due day. Clearing an existing setting pauses
its managed series and removes its payments from payable/upcoming views and the
cash forecast without deleting statement or payment history. Setting a due day
again reactivates the series.

Statement close currently defaults to **25 days before payment**, using
`CreditCard::PaymentSchedule::STATEMENT_GAP_DAYS`. This is an assumption,
not a bank-specific or statement-confirmed date. An occurrence is generated
on its estimated closing date, using posted activity available so far, and
continues refreshing as posted activity arrives. Future-cycle amounts are
not projected from past payments. The first run starts at the latest cycle
whose estimated closing date is today or earlier, rather than inventing
missed historical bills. Changing the due day immediately recalculates unpaid
estimated statements due today or later, including their due dates, statement
boundaries, and amounts, while retaining recorded allocations. Past-due statements
and settled payment history keep their dates. If the new statement close is still
in the future, no unpaid estimate contributes until that closing date.

By default, the estimate is the **full outstanding statement debt**. Enable
**Minimum payment only** in the SPA credit-card account settings to estimate a
payment of **1% of the full closing statement balance** instead. This single
flag defaults to off for both existing and new cards. The full statement
balance is preserved separately from the estimated payment; each new minimum
includes carried principal, even after the previous minimum was paid.

The setting is available in the SPA create/edit drawers and the account API,
not the legacy ERB account forms. Legacy ERB templates are unchanged.

The 1% rate is the requested **Citi approximation**, not an issuer-confirmed
minimum. There is no issuer detection or table of issuer percentages.
[Citi's minimum-payment guidance](https://www.citi.com/credit-cards/understanding-credit-cards/how-do-credit-card-minimum-payments-work)
describes formulas that can also include fixed minimums, interest, fees, and
past-due amounts; a percentage alone does not reproduce those formulas. This
estimate does not add those components or use the existing fixed-currency
**Minimum payment** metadata field. Posted interest and fees already included
in the closing balance remain part of the percentage base. Verify the actual
minimum on the bank's statement. These settings do not change bank autopay.

The closing balance includes carried debt and posted charges, fees, and interest
through the estimated close. Reconciled daily balances in the account's
currency take precedence over opening-valuation reconstruction, which can
be inaccurate when a linked account has incomplete imported history.
Pending transactions and later-cycle purchases are excluded. Repayments and
post-close credits are matched in the account's currency. Confirmed repayments
reduce what remains dollar for dollar; later refunds and other non-payment
credits reduce the principal base before calculating the minimum percentage.
Minimum estimates round to the account currency's display precision.

The nightly job keeps refreshing unpaid cycles. Full-payment estimates do
not bill carried debt twice; minimum-payment estimates calculate a separate
obligation for each cycle without counting a repayment against multiple minima.
Settled payment history is preserved. Changing **Minimum payment only**
immediately recalculates open estimates while retaining recorded allocations.
The displayed post-close credit total describes credits since that particular
close, so totals from overlapping cycles must not be added together.

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

The home page **Cash Forecast** includes these dynamic statement payments as
outflows from today through day 30, using each open occurrence's unpaid remainder
on its scheduled due date. Statements due today reduce today's projected balance;
past-due statements are excluded even if still unpaid, not moved onto today.
Only visible cards and statements in the family's currency contribute. Ordinary
card purchases and transfer series are not added again; the starting balance
still comes only from checking accounts.

### API fields and deployment

Deployments must run the `AddManagedCreditCardPayments` and
`AddMinimumPaymentOnlyToCreditCards` database migrations.
The existing account update endpoint accepts:

```json
{
  "account": {
    "accountable": {
      "payment_due_day": 9,
      "minimum_payment_only": true
    }
  }
}
```

Send `payment_due_day: null` to disable automatic statement payments. Account
responses expose `payment_due_day_source` (`manual` or null) and
`statement_gap_days`; historical due-day estimates are no longer returned.
Account responses also expose the boolean `minimum_payment_only`. Send `false`
to restore full-statement estimates; omitting it preserves the existing setting.
Enabling it without a due day does not create payment estimates.


Recurring-transaction responses identify the series with
`system_managed_kind: "credit_card_payment"` and expose `current_occurrence`
with the estimated statement dates, closing balance, post-close credits,
expected amount, remaining amount, currency, and due-date source. The
series-level `amount` is zero bookkeeping, not an estimate: use occurrence
amounts for these series. With `upcoming=true`, only configured cards with a dated
open occurrence due today or within the statement-to-due gap appear (currently
25 days, from `CreditCard::PaymentSchedule::STATEMENT_GAP_DAYS`). Ordinary
recurring items retain their 10-day default. An explicit `upcoming_days`
overrides both windows. The `amount` / `amount_cents` fields report the
card occurrence's unpaid remainder. Unknown due days and next dates are
null, not invented dates.
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
