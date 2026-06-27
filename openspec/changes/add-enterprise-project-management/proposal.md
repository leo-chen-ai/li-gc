## Why

The admin platform can manage construction-site execution data, but it does not yet give company managers a project-level business view of revenue, cost, receivables, payables, cash collection, cash payment, and profit. The user wants a new enterprise project management module that makes every project financially accountable and visually clear enough to review online.

## What Changes

- Add a new `企业项目管理` admin module with a project list focused on business/financial operation rather than site worker attendance.
- Add project detail views for `经营看板`, `开票`, `收票`, `回款`, and `付款`.
- Add backend PostgreSQL tables for enterprise projects, issued invoices, received invoices, collections, and payments, all soft-deletable and auditable.
- Add authenticated admin CRUD APIs with search, filters, pagination, export-ready full-data query support, and project-scoped summary APIs.
- Add frontend pages, dialogs, tables, summary cards, empty/loading/error states, and responsive layouts following `DESIGN.md`.
- Add profit and risk calculations:
  - `现金毛利 = 已回款 - 已付款`
  - `账面毛利 = 已开票 - 已收票`
  - `应收未回 = 已开票 - 已回款`
  - `应付未付 = 已收票 - 已付款`
- Add tests for migrations, API CRUD/list/summary behavior, frontend calculations, and production build readiness.
- Seed realistic demo data after deployment so the online environment can be reviewed immediately.

## Capabilities

### New Capabilities

- `enterprise-project-management`: Manage enterprise project business records and project-scoped issued invoices, received invoices, collections, payments, financial summaries, and detail views.

### Modified Capabilities

- None.

## Impact

- Backend:
  - New SQL migrations for enterprise project and financial transaction tables.
  - New admin routes/handlers for CRUD, list, detail summary, and exports.
  - New integration tests for the project financial lifecycle.
- Frontend:
  - New sidebar entry and route group under `企业项目管理`.
  - New business project list page and project detail page with tabbed financial modules.
  - New service/hooks/types/tests for enterprise project financial data.
- Operations:
  - Database migration, API/UI deployment, production health verification, and production demo data insertion.
