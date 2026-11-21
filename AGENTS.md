<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->
# Project rules
- Money is stored and computed as integer paise; all totals go through `src/lib/finance/engine.ts` (periods) and `src/lib/finance/monthly.ts` (month comparisons) so every screen uses the same income/expense/refund/transfer rules; only confirmed records count (`isCountable`), and an in-progress month is also compared day-for-day so partial months aren't judged against full ones.
- Statement parsing in `src/lib/import/` is pure (no I/O) and covered by tests; the CSV is read in the browser and only confirmed rows are sent to the `import_statement` database function, which saves a batch atomically and is idempotent per batch id.
- Duplicate and possible-transfer rows are flagged for the user and never deleted or dropped automatically; invalid rows are always reported and counted as rejected.
- Scan & Extract: image reading runs only in the server function (`src/lib/extract/ocr.server.ts`, Lovable AI gateway, strict JSON schema, no data retention); classification, interpretation, validation, categorisation and duplicate checks in `src/lib/extract/` are pure and tested, and never alter extracted values to make totals match.
- Scanned documents never become transactions without the review screen; saving goes through the atomic, idempotent `save_extraction` database function, and receipt items are stored as details of one transaction, never as separate payments.
- Receipt images live only in the private `documents` bucket under the user's folder, are shown via short-lived signed links, require recorded consent before upload, and are deleted after save/discard unless the user chooses to keep them.
- Budgets and savings: budget spending is computed only by `src/lib/finance/plans.ts` on top of the engine's rules (confirmed expense − refund per category per month); savings contributions live in their own tables and are never fed into the engine, so they can't change income/expense/balance totals; the database trigger `check_goal_balance` keeps each goal's saved amount ≥ 0.
