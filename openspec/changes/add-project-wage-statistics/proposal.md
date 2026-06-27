## Why

Project detail currently has project, unit, team, worker, and attendance tabs, but it does not give operators a place to maintain monthly wage payout records. The reference project and supplied wage sheet show that wage management needs to live inside the project detail workflow, with manual entry, Excel import, and export available from the same tab.

## What Changes

- Add a `工资统计` tab to the project detail page, aligned with the existing compact tab/table style and the provided reference screenshot.
- Store wage payout data in backend tables:
  - a monthly/company wage batch summary for table display and totals;
  - worker-level wage items imported from or exported to Excel.
- Add project-scoped API endpoints for listing, creating, updating, deleting, importing, and exporting wage batches and wage items.
- Support manual creation/editing of a wage batch and its key amount fields.
- Support Excel import from the supplied wage sheet shape, including worker identity, team, attendance days, bank card/bank, due amount, paid amount, adjustment amount, unpaid amount, and adjustment reason.
- Support export of the currently filtered wage records so operators can download auditable wage data.
- Remove import entry points from the project detail unit, team, and worker modules.
- Add Excel-openable full-data export for the unit, team, and worker modules.
- Ensure the unit, team, worker, and wage tables paginate after 10 rows.
- Keep external payroll platform dispatch/confirmation out of scope for this change.

## Capabilities

### New Capabilities
- `project-wage-statistics`: Project detail wage statistics tab with persisted wage batches, wage item details, manual maintenance, Excel import, and export.
- `project-data-grid-operations`: Project detail unit, team, and worker table operations for import removal, full-data export, and 10-row pagination.

### Modified Capabilities
- None.

## Impact

- Backend:
  - New SQL migrations under `api/migrations`.
  - New handlers/routes in `api/src/feature/admin/construction/handler.rs` and `api/src/feature/admin/routes.rs`.
  - Possible parsing/export helper dependency if the backend owns binary Excel generation; otherwise frontend can parse/import and backend exports CSV/XLSX-compatible data.
- Frontend:
  - Project detail tabs and tab content in `ui/src/features/projects/components/ProjectDetailPage.tsx`.
  - API endpoint definitions, service methods, React Query hooks, and TypeScript types under `ui/src/features/projects`.
  - Excel parsing/export UI for upload/download workflows.
- Tests:
  - Backend route/handler tests for list/create/update/delete/import aggregation behavior where local test infrastructure allows.
  - Frontend unit tests for wage totals, Excel row mapping, and table state where existing test setup supports it.
