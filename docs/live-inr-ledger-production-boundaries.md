# Crush.X Live / Coins / INR gifts — production boundary design

**Status:** architecture specification only. `coins-ledger-sandbox.js` and `live-gifting-preview.js` are browser-only exercises, do not sell coins, start Live, handle money, or pay creators. **Never deploy this demo as an authoritative wallet.**

## Trust boundaries
- Browser/WebView/mobile client: display quotes and server receipts, send signed-in requests, never alter balances directly. Do not trust frontend success callbacks as payment evidence.
- Payments service: verifies an authenticated user, valid price/catalog version, provider order and signature, currency INR and integer paise, webhook signatures and timestamps, and independently confirms provider payment capture/status before issuing value.
- Ledger service: owns accounts, transaction IDs, frozen posting records, risk limits and balancing logic. Each DB transaction posts equal and opposite integer coin units or paise **within the same currency**. No cross-currency postings without a specifically documented and reconciled conversion event.
- Creator payout service: separate *pending* from *available* and *paid* balances; funds become available only after finalized capture, refunds and reserve/risk checks. Payout requires provider reconciliation, authorized approval and auditable beneficiary checks. Gift receipts alone do not imply settlement.

## Required server persistence
Model at least `wallet_account(account_id,owner_id,asset,account_type,status)`, `ledger_transaction(id,request_key,kind,asset,status,created_at)`, `ledger_posting(transaction_id,account_id,delta_minor_unit)`, `gift_order(id,viewer_id,creator_id,asset,amount_minor,price_version,status,provider_order_id)`, `provider_event(provider,event_id,verified_at,payload_hash,processed_at)`, and `outbox(event_id,transaction_id,type,payload,status)`.
Use a unique account key scoped to subject and asset, unique `request_key` scoped to the payer and operation, and unique provider event/order identifiers. Use DB `NUMERIC` or bounded 64-bit integer minor units (never floating-point INR). Require a balanced postings constraint in transaction logic; reconcile postings and external provider accounts daily. Enforce database transactions and row locks (or serializable concurrency) to prevent double spending.

## Server flows
1. **Coin purchase**: server quotes a fixed catalog item, creates pending provider order, client opens permitted provider checkout, verified provider webhook confirms capture, server independently retrieves payment status, then atomically creates issuance postings and marks the order credited. Duplicate or reordered webhooks must not double-credit.
2. **Coin gift**: authenticated creator/stream eligibility and payer ownership checked; quote amount and available coin balance checked under lock; idempotency key required; atomic payer coin debit and creator pending credit; transaction receipt and outbox emitted only *after* commit. Refuse replay with conflicting payload, self-gifting, invalid price and limit violations.
3. **Direct INR gift**: separate provider order and capture verification. Do not treat a browser-supplied "paid" flag as authoritative. Ledger posted in INR paise only after verified payment; funds are held pending creator eligibility and chargeback/refund windows. Legal/accounting review of tax, platform terms, creator payouts and app-store billing is required before going live.
4. **Refund, reversal and disputes**: append compensating entries with linkage to the original receipt; do not delete immutable past postings. Handle simultaneous refund/gift races with locking and insufficient-balance recovery policy.
5. **Broadcast**: use a real authorized media ingest/playback provider, short-lived stream keys, signed viewer tokens, moderation, bandwidth limits and server-authoritative stream state. A simulated preview is not a Live room.

## Nonnegotiable release gates
- Verified authorized merchant account/provider and Android/iOS billing-policy review, gateway sandbox payments/webhooks and fraud tests.
- Concurrent double-spend + duplicate webhook + network retry + refund + settlement reconciliation tests.
- User entitlement, KYC/AML/tax/payout requirements assessed for India with legal and finance specialists; no made-up GST or TDS rates.
- Server audit logs without secrets/PII leakage, least-privilege IAM, key rotation, encryption at rest, monitoring/alerts and data retention policies.
- Owner approval before live deployment. A real Android debug/release build, signed and tested on physical phone, is still required.

## Demo code invariants
`coins-ledger-sandbox.js`: double-entry frozen postings, replay idempotency, max 100 demo coins per gift, max 500 per UTC day, bounded nonnegative user balances, no network, no persistence, no payout/withdrawal, and `directInrStatus` always reports `NOT_CONNECTED`. Any values shown are fake and reset on reload/logout.
