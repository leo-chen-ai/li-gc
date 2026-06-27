## Context

The current Shanhuai admin platform is project-first and already uses a compact React/shadcn UI, Rust Axum admin APIs, PostgreSQL migrations, soft-delete tables, and K3s deployment. Existing construction project pages focus on site execution: units, teams, workers, attendance, wages, contracts, and integrations. The requested enterprise project management module is a separate business-management layer: it must answer whether a company project is profitable by tracking income-side invoices/collections and cost-side received invoices/payments.

The module should follow `DESIGN.md`: Chinese copy, restrained green primary color, dense scan-friendly tables, stable filters, no marketing hero, good empty/loading/error states, and responsive layouts that avoid horizontal overflow at the user’s working resolution.

## Goals / Non-Goals

**Goals:**

- Add a new admin sidebar group/page set for `企业项目管理`.
- Persist enterprise projects and project-scoped financial records in PostgreSQL.
- Support CRUD, search, filters, pagination, full-data export, and project detail summary for:
  - Enterprise projects
  - Issued invoices (`开票`)
  - Received invoices (`收票`)
  - Collections (`回款`)
  - Payments (`付款`)
- Show project profit and risk metrics using consistent formulas:
  - `现金毛利 = 已回款 - 已付款`
  - `账面毛利 = 已开票 - 已收票`
  - `应收未回 = 已开票 - 已回款`
  - `应付未付 = 已收票 - 已付款`
- Provide backend and frontend tests proving the lifecycle works.
- Deploy migrations/API/UI and seed production demo data for review.

**Non-Goals:**

- Do not implement full accounting general ledger, voucher posting, bank reconciliation, tax-control device integration, invoice OCR, approval workflows, or multi-tenant accounting periods in the first version.
- Do not couple this module to the existing construction worker/attendance wage module. A later version can link enterprise projects to construction projects, but this change only needs optional reference fields.
- Do not implement real e-invoice issuing. `开票` is a business record of issued invoices, with attachments and status.

## Decisions

1. **Use a dedicated enterprise-project namespace instead of extending construction projects.**
   - Add tables prefixed with `enterprise_` or `enterprise_project_`.
   - Rationale: construction projects are currently site-management records with many实名制 fields. Business projects need cleaner finance fields and may represent management/accounting objects that do not match a single site record.
   - Alternative considered: add tabs to existing project detail only. Rejected because it would mix site-worker workflows with company finance workflows and make permissions/navigation harder.

2. **Use four concrete financial record tables.**
   - `enterprise_project_issued_invoices`
   - `enterprise_project_received_invoices`
   - `enterprise_project_collections`
   - `enterprise_project_payments`
   - Rationale: the user named 开票、收票、回款、付款 as modules. Separate tables keep validation, filters, statuses, export columns, and future permissions simple.
   - Alternative considered: one generic transaction table with `type`. Rejected for first version because invoices and payments have different fields and status vocabulary.

3. **Store money in cents as signed 64-bit integers.**
   - All money columns use `_cents` and API helpers accept yuan strings/numbers where forms need convenience.
   - Rationale: matches existing wage handling patterns and avoids floating point drift.

4. **Calculate summaries on the backend.**
   - Summary endpoints aggregate all matching project records, not only the current page.
   - Frontend displays backend totals and only computes local form previews.
   - Rationale: the user has repeatedly corrected frontend-only pagination/summary issues. Profit must be authoritative on the backend.

5. **Keep status simple but explicit.**
   - Enterprise projects: `planning`, `active`, `paused`, `completed`, `closed`.
   - Issued/received invoices: `draft`, `issued`/`received`, `voided`.
   - Collections/payments: `pending`, `confirmed`, `cancelled`.
   - Rationale: enough to filter and avoid counting invalid records. Summary counts only non-void/cancelled records.

6. **Frontend pages use shared operational-table patterns.**
   - Reuse existing shadcn components, `ProjectDetailPage` table/pager conventions, lucide icons, compact metric cards, and full-screen or large dialogs for dense forms.
   - Rationale: the user wants every module designed and visually good; consistency matters more than decorative UI.

## Risks / Trade-offs

- **Risk: duplicate project concepts confuse users** → Use sidebar label `企业项目管理` and page text `经营项目`, keeping it visually distinct from site `项目管理`.
- **Risk: profit can be interpreted multiple ways** → Show both cash and accounting views with formulas in tooltip/helper text, and use cash view as primary.
- **Risk: records entered without invoices make summaries look inconsistent** → Allow unlinked collections/payments but show linked invoice fields when present; summaries remain based on actual records.
- **Risk: export scope ambiguity** → Export endpoints default to all records matching current filters, not only current page, and tests must prove this.
- **Risk: large implementation scope** → Build in vertical slices: schema/API tests first, then data layer, then project list/detail UI, then financial module dialogs/exports.

## Migration Plan

1. Add PostgreSQL migrations for enterprise project and four financial record tables, with indexes on project, date, status, counterparty, invoice number, and soft-delete fields.
2. Add admin API routes and integration tests.
3. Add frontend routes, services, hooks, typed calculations, and UI tests.
4. Run backend tests, frontend unit tests, and production build.
5. Deploy API with migrations, deploy UI, then seed realistic production demo data.
6. Verify `/health`, K3s pod readiness, API summary correctness, and browser-visible page access.

Rollback:

- Hide the sidebar entry and routes in UI.
- Revert API image if needed.
- Run down migration only if no production-entered enterprise project data must be preserved.

## Open Questions

- None blocking for the first version. The initial implementation will treat `现金毛利` as the primary profit metric and `账面毛利` as the secondary metric, matching the current product direction.
