# Connect Your Apps — implementation plan

Based on the feasibility report. Only routes that really work today get a working Connect button. Everything else is shown honestly as "Needs approval", "Import a file instead" or "Not available". Look stays cream + coral.

## What you will get

**1. Connect Your Apps screen** (from Home, Transactions and Profile)
- Title, subtitle "Bring your spending activity together in one place.", counts of connected sources and available methods, last successful sync, privacy note.
- Search ("Search apps and services...") and filters: All Apps, Payments, Shopping, Food & Grocery, Transport, Subscriptions, Banks.
- Sections in order: Connected apps → Available now → Needs provider approval → Not available → privacy.
- Each card shows the real state: Available, Connected, Awaiting setup, Unsupported, Coming later. Unavailable cards never show a working Connect button.

**2. Provider detail screen** (one per app)
- What information can be shared (only fields that source really contains), why SMARTFIN needs it, how it is used, how to get the file from the app, and an unticked consent box: "I understand what information will be shared and authorise this connection."
- Unavailable providers show "This provider does not currently have a verified direct connection available." plus an alternative (statement import, Scan & Extract).

**3. Working connections built now — provider export files**
- **Google Pay:** Google Takeout activity file.
- **Paytm:** UPI statement (Excel).
- **Amazon:** "Request My Data" order-history file.
- **PhonePe and Google Pay statement PDFs:** read with the existing AI reader, then the same review screen.
- Each upload is a sync: records received, accepted, needing review, duplicates, rejected, errors. The same file twice never imports twice.

**4. One shared processing engine for all sources**
- Orders are not payments; cancelled orders never become expenses; refunds are refunds, not income; failed and pending payments don't count; transfers aren't spending.
- Merchant names tidied ("ZOMATO ONLINE", "Zomato Ltd" → Zomato) while keeping the original.
- **Cross-source matching:** an Amazon order and the matching Google Pay / bank payment become one expense, with both source records linked and viewable. Exact references first, otherwise amount + date + merchant with a match score shown for review. Nothing is deleted or merged silently.
- Order items kept as details of one transaction, as with receipts.
- Everything goes through a review screen before saving.

**5. Manage Connections screen**
- Per connection: method, status, connected date, data types, last sync, records imported, consent date.
- Actions: Sync now (upload a newer file), Pause, Resume, Review permissions, Disconnect / revoke consent (keeps your confirmed transactions), and a separate "Delete imported records from this source".
- Sync history list.

**6. Across the app**
- Transactions: source badge per record, filter by All sources / Payment apps / Shopping / Food / Transport / Banks / Manually added.
- Analytics: spending by app.
- Monthly Comparison: app-wise changes.
- Home: connected sources status, with a note that connected data may not be your complete picture.

## Shown but not working yet (with reason)
- **Gmail receipts** — "Awaiting setup". Becomes a real per-user connection once a workspace admin adds a Gmail client. Built in a later step.
- **Uber, Swiggy, Zomato** — "Needs provider approval".
- **Ola** — "Partner access required".
- **Banks (Account Aggregator)** — "Needs a regulated partner".
- **Flipkart, Blinkit, Netflix, Spotify** — "No direct connection — import or scan instead".
- No Android notification capture (web app), no scraping, never asks for passwords, PINs or OTPs.

## Technical details
- **Provider registry** in code (`src/lib/connect/providers.ts`): id, name, category, aliases, capability status, methods, verified fields, doc links. Pure, tested, read by the UI.
- **Adapters** (`src/lib/connect/adapters/`): common interface (`getAvailableCapabilities`, `parseExport`, `initiateConnection`, `fetchHistoricalRecords`, `revokeConnection`…). Unsupported operations return an explicit `unsupported` result. File adapters are pure parsers (Takeout JSON, Paytm XLSX, Amazon CSV) → unified `SourceRecord` (record_type payment/order/refund/cancellation/pending/subscription, statuses, amounts in paise, items, refs).
- **Engine** (`src/lib/connect/engine/`): normalise → classify → merchant normalisation → cross-source matching → categorise (reusing category rules) → validate. Pure and tested.
- **Database migration:** `app_connections` (user, provider, method, status, connected/paused/revoked timestamps), `connection_consents` (scope, purpose, granted/expiry/revoked), `sync_batches` (counts, errors, file hash for idempotency), `source_records` (provider record id, raw normalised fields, link to transaction, unique per user+provider+record id), `connection_audit_events`. Transactions gain `provider_id` and `source_kind`. All user-scoped RLS + GRANTs. Atomic, idempotent `ingest_source_records` function saves a reviewed batch, linking matched records to one transaction.
- **PDF statements:** server function sends the PDF to the Lovable AI gateway with a strict schema (no retention), consent required, same as Scan & Extract.
- **Totals** keep using the finance engine; only confirmed records count.
- **Tests:** registry and capability rules, each parser (valid/empty/invalid/missing fields), status interpretation (expense, income, refund, failed, pending, cancelled, unpaid order, transfer), order + UPI + bank debit counted once, idempotent re-import, revoked connection cannot sync. Plus a signed-in browser check with fictional files.
- **AGENTS.md:** add rules for the provider registry, adapters and shared engine.
