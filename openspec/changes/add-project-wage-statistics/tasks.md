## 1. Backend Data Model

- [x] 1.1 Add migration for `construction_wage_batches` with project, payroll month, company, employee count, payable/paid/unpaid cents, status, creator/updater, timestamps, soft delete, and indexes.
- [x] 1.2 Add migration for `construction_wage_items` with batch/project references, worker identity fields, team, attendance days, settlement hints, bank fields, amount cents, adjustment reason, timestamps, soft delete, and indexes.
- [x] 1.3 Add rollback migration that drops wage item and wage batch tables without touching existing construction tables.

## 2. Backend API and Validation

- [x] 2.1 Add focused backend tests for wage month/filter pagination, manual summary payloads, import rows, amount conversion, and Excel-openable CSV escaping.
- [x] 2.2 Add typed amount/month parsing helpers and project-scoped list/create/update/delete handlers.
- [x] 2.3 Add import endpoint that validates structured rows, saves batch/items in one transaction, and recomputes employee count and amount totals server-side.
- [x] 2.4 Add export endpoint for current project and filters, emitting Excel-openable CSV with Chinese headers and text-safe ID/card fields.
- [x] 2.5 Register wage routes under `/api/v1/admin/projects/{projectId}/wage-batches` and ensure auth/admin middleware covers them.

## 3. Frontend Data Layer

- [x] 3.1 Add wage endpoint constants, TypeScript types, service methods, and React Query keys/hooks.
- [x] 3.2 Add frontend wage amount helpers for yuan display, cents conversion, totals, and status labels with unit tests.
- [x] 3.3 Add Excel parsing helper supporting `.xls` and `.xlsx`, normalized Chinese header aliases, blank-row skipping, and missing-column errors.

## 4. Project Detail UI

- [x] 4.1 Add `工资统计` to the project detail tab list without disrupting existing tabs.
- [x] 4.2 Add wage filters, summary totals, table, loading/error/empty states, pagination or stable row limits, and action buttons matching the existing admin style.
- [x] 4.3 Add manual create/edit dialog for wage batch summary fields with validation and submit-state handling.
- [x] 4.4 Add import workflow with file picker, parse validation/error feedback, backend import call, and query invalidation.
- [x] 4.5 Add export workflow that passes current filters to the backend and downloads the returned file.
- [x] 4.6 Remove import actions from `建设单位`, `班组信息`, and `项目工人` modules if present.
- [x] 4.7 Add full-data Excel-openable export actions for `建设单位`, `班组信息`, and `项目工人`.
- [x] 4.8 Add 10-row pagination to `建设单位`, `班组信息`, `项目工人`, and `工资统计` tables, while keeping exports independent of pagination.

## 5. Verification and Review

- [x] 5.1 Run backend formatting/tests or the narrowest reliable API verification available in this repo.
- [x] 5.2 Run frontend typecheck/build and relevant unit tests.
- [x] 5.3 Manually verify the wage import parser with the supplied wage sheet.
- [x] 5.4 Review security, data isolation, amount precision, import duplicate behavior, and rollback risk before marking the change complete.
