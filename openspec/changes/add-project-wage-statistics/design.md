## Context

The current project detail page already has a project-scoped tab workflow backed by Rust admin endpoints for units, teams, workers, attendance records, and attendance devices. The supplied reference screenshot shows a `工资统计` tab with month/status filters, summary amounts, and a batch-level table. The supplied `.xls` file is an old BIFF Excel workbook containing worker-level rows with identity, team, attendance days, bank, due amount, paid amount, adjustment amount, unpaid amount, and reason columns.

This change should follow the existing construction admin pattern: project-scoped backend data, soft deletes, compact Chinese admin UI, loading/error/empty states, and table-first workflows.

## Goals / Non-Goals

**Goals:**

- Add a `工资统计` tab inside project detail.
- Persist monthly/company wage batch summaries and worker-level wage item details.
- Let operators manually create/edit/delete wage batches.
- Let operators import wage rows from `.xls` and `.xlsx` files matching the supplied wage sheet shape.
- Let operators export filtered wage data for offline review.
- Remove unit/team/worker import buttons from project detail modules.
- Add Excel-openable export actions for all unit, team, and worker rows in the current project.
- Paginate unit, team, worker, and wage tables with 10 rows per page by default.
- Keep API and UI behavior project-scoped, authenticated, and consistent with existing construction modules.

**Non-Goals:**

- Do not implement external payroll platform dispatch, confirmation, task polling, or receipt workflows.
- Do not change existing project, unit, worker, or attendance behavior except where the wage tab reads related names for display.
- Do not replace the current project detail layout or introduce a new component system.
- Do not add import support to unit, team, or worker modules as part of this change.

## Decisions

1. Use two backend tables.
   - `construction_wage_batches` stores one table row per project/month/company/status, including employee count, payable amount, paid amount, unpaid amount, created/updated user ids, and timestamps.
   - `construction_wage_items` stores imported or manually entered worker-level rows tied to a batch, including masked identity source fields, team name, attendance days, settlement hints, wage card/bank, payable amount, paid amount, adjustment amount, unpaid amount, and adjustment reason.
   - Rationale: the UI needs batch summaries, while import/export needs item-level audit detail. Storing only summaries would lose the supplied Excel detail; storing only raw items would make status and audit columns harder to maintain.

2. Parse Excel in the frontend, validate and persist in the backend.
   - Add a browser-side Excel parser dependency that supports both `.xls` and `.xlsx`.
   - The frontend maps headers by normalized Chinese aliases and submits structured JSON rows to the backend import endpoint.
   - The backend re-validates required values, recomputes summary totals, and saves batch/items transactionally.
   - Rationale: Rust currently has no Excel parsing dependency, and the sample is BIFF `.xls`; browser-side parsing avoids adding a heavier backend binary parser while still letting the backend own validation and persistence.

3. Store amounts as integer cents.
   - API accepts decimal yuan strings/numbers and normalizes to integer cents server-side.
   - API responses include cents fields and/or formatted yuan helper fields as needed by the frontend.
   - Rationale: wage summaries must add exactly; integer cents avoid floating-point drift.

4. Treat wage month as a month value.
   - Persist as `payroll_month DATE NOT NULL`, normalized to the first day of the selected month.
   - Display and filter as `YYYY-MM`.
   - Rationale: PostgreSQL can index and compare dates reliably, while the UI remains month-based.

5. Support filtered export through a backend endpoint.
   - Export endpoint returns a downloadable CSV-compatible file at minimum, with headers matching the wage tab/detail data.
   - If implementation adds a lightweight XLSX writer without bloating the API image, the exported extension can be `.xlsx`; otherwise CSV is acceptable for the first implementation because Excel opens it directly.
   - Rationale: the main requirement is operational export. CSV keeps the backend small and avoids adding large runtime dependencies.

6. Keep creator/updater display opportunistic.
   - Tables include nullable `created_by_user_id` and `updated_by_user_id`.
   - Handlers should fill them from `AuthUser` when available. If names are not cheaply joinable, the UI displays `-` or the user id until a shared user-name projection exists.
   - Rationale: the screenshot has creator/updater columns, but this change should not require a global audit/user refactor.

7. Export unit/team/worker data from the frontend using already loaded project-scoped rows.
   - Unit, team, and worker modules are already loaded in full by project-scoped list endpoints, so their export buttons can generate Excel-openable files from the full in-memory module dataset, not just the current page.
   - The export should use Chinese column headers and text-safe identifier fields.
   - Rationale: the user asked to export all data for these modules; adding backend export routes is unnecessary unless later datasets become too large for the existing list endpoints.

8. Paginate tables in the project detail UI at 10 rows.
   - Pagination is applied client-side for unit, team, worker, and wage table displays.
   - Exports ignore pagination and include all rows matching the module scope/filter.
   - Rationale: current module endpoints return complete project datasets, and the immediate requirement is to keep tables readable once they exceed 10 rows.

## Risks / Trade-offs

- **Excel header variance** -> Mitigate with normalized alias matching for the supplied headers and clear import errors listing missing columns.
- **Duplicate month/company imports** -> Mitigate by making import mode explicit in implementation: create a new batch by default, or replace an existing selected batch only after confirmation.
- **Large imports blocking the UI** -> Mitigate with client-side row limit validation and backend transaction batching. The first version can target typical monthly project wage sheets rather than very large payroll archives.
- **CSV export encoding issues in Excel** -> Mitigate with UTF-8 BOM and Chinese headers if CSV is used.
- **Existing dirty workspace** -> Keep implementation scoped to wage files and avoid reverting unrelated local changes.

## Migration Plan

1. Add migrations for `construction_wage_batches` and `construction_wage_items`, including indexes on project/month/status and batch id.
2. Deploy backend migration before exposing the new UI tab.
3. Rollback by hiding the UI tab and dropping the new wage tables with the down migration; existing project/unit/worker/attendance data is unaffected.

## Open Questions

- None blocking. The implementation can decide whether export is CSV or XLSX based on dependency size and build reliability, as long as Excel can open the downloaded file.
