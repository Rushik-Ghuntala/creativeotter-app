# Credit accounting

One workspace has one wallet shared by web, Codex and Claude. 1000 integer units represent one display credit; RPC amounts are decimal strings. Provider micro-USD budgets and retail credit balances are separate. Native image generation/import uses **0 CreativeOtter credits**; host usage limits can still apply. Native success creates a media/history record, not a provider job or a credit debit.

## Provider lifecycle

1. A quote snapshots the workspace/model’s enabled, unexpired `private.workspace_credit_prices` row: credit amount, pricing version and expiry. No debit occurs for a quote.
2. A direct browser approval checks the existing scope, quote expiry, provider budget and locked credit wallet. In the same database transaction it creates the unique job and reserves its exact credit amount. Insufficient credits abort everything, including job creation and provider-cost reservation.
3. Valid saved fulfillment changes the reservation into one final charge. Completion retries do not charge twice.
4. A confirmed failed job releases reserved credits once. `needs_reconciliation` and `save_failed` retain their reservation; they do not grant a refund while an operation might still complete. Successful/failed jobs cannot be reopened through the worker.

The append-only `credit_ledger` records grant/reserve/charge/release movements. A unique finalization index prevents both charge and release for one job. API clients have read-only table privileges; trigger functions perform atomic wallet changes. Ledger updates/direct deletes are rejected, except cascading workspace deletion. Native imports do not depend on a positive credit balance.

## Issuance and pricing

No production price, free trial or purchased credits are fabricated. New and existing wallets start at zero. The operator deliberately configures workspace/model pricing and its expiry before allowing provider quotes. Prices in tests (16 fixture credits) are isolated to disposable workspaces and **are not an approved product price**. Private provider pricing is also verified separately and can expire independently.

`record_credit_grant` is service-role-only and accepts a bounded positive unit amount, an external event ID and an audit reason. Concurrent repeats with identical metadata return the existing grant. Reusing the event for another workspace or amount fails. It is not exposed through MCP or a user-accessible server action. A future checkout webhook must validate the payment provider’s signature, event type, actual paid amount/currency, product mapping and ownership before calling it. No browser success-page callback is a valid payment receipt.

**Paid checkout, subscriptions, tax, payment refunds/chargebacks, credit expiration and charge refunds after completed delivery are not implemented.** Purchases remain explicitly unavailable in all UI/capability responses. This release implements accounting, not a paid public billing launch. A manual production issuance requires its own authorized business reason; the integration tests never issue production credits.

## Validation

`yarn test:credits:database` uses two disposable users/workspaces and scoped fixture prices. It checks zero initial balances; tenant isolation; denied client issuance/mutations; idempotent concurrent grants; fixed quote prices; competing approvals when only one can be afforded; one reservation per approved job; the same wallet visible through Codex/Claude client claims; single release on confirmed failure; holds on uncertain/save failures; no completion before a stored output; one final charge; late failure notifications; ledger/account sums; and ledger immutability. All test media, users and credit rows are removed. No media-provider inference or payment request is made.
