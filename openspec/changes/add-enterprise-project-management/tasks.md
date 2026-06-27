## 1. Backend Schema

- [x] 1.1 Add migration for `enterprise_projects` with project code, name, customer, contract amount cents, owner, status, planned/actual dates, remark, audit columns, soft-delete flag, and indexes.
- [x] 1.2 Add migration for `enterprise_project_issued_invoices` with project id, customer, invoice number, invoice date, amount cents, tax rate, status, attachment JSON, remark, audit columns, soft-delete flag, and indexes.
- [x] 1.3 Add migration for `enterprise_project_received_invoices` with project id, supplier, invoice number, invoice date, amount cents, tax rate, expense type, status, attachment JSON, remark, audit columns, soft-delete flag, and indexes.
- [x] 1.4 Add migration for `enterprise_project_collections` with project id, payer, optional issued invoice id, collection date, amount cents, account, status, attachment JSON, remark, audit columns, soft-delete flag, and indexes.
- [x] 1.5 Add migration for `enterprise_project_payments` with project id, payee, optional received invoice id, payment date, amount cents, account, status, attachment JSON, remark, audit columns, soft-delete flag, and indexes.
- [x] 1.6 Add down migration that drops only the new enterprise project management tables.

## 2. Backend API and Tests

- [x] 2.1 Add integration tests for enterprise project CRUD, search, status filter, backend pagination, soft delete, and all-matching export scope.
- [x] 2.2 Add integration tests for issued invoice CRUD/list/filter/export and contribution to project summary.
- [x] 2.3 Add integration tests for received invoice CRUD/list/filter/export and contribution to project summary.
- [x] 2.4 Add integration tests for collection CRUD/list/filter/export and contribution to cash profit and receivable balance.
- [x] 2.5 Add integration tests for payment CRUD/list/filter/export and contribution to cash profit and payable balance.
- [x] 2.6 Implement shared backend parsing helpers for enterprise module pagination, filters, money cents, statuses, attachments, and CSV export.
- [x] 2.7 Implement enterprise project handlers and routes.
- [x] 2.8 Implement issued invoice, received invoice, collection, and payment handlers and routes.
- [x] 2.9 Implement project detail summary endpoint using all valid project-scoped records and backend profit formulas.
- [x] 2.10 Register admin routes and keep API responses consistent with existing `ApiSuccess` shape.

## 3. Frontend Data Layer and Tests

- [x] 3.1 Add endpoint constants and service methods for enterprise projects, summary, issued invoices, received invoices, collections, payments, and exports.
- [x] 3.2 Add TypeScript types for enterprise projects, financial records, filters, list responses, and summary metrics.
- [x] 3.3 Add React Query hooks for list/detail/CRUD/export flows with cache invalidation per project and per module.
- [x] 3.4 Add frontend helper tests for money formatting, summary metric display, status labels, and table pagination helpers.

## 4. Frontend UI

- [x] 4.1 Add `企业项目管理` sidebar entry and route files while preserving existing project management navigation.
- [x] 4.2 Build enterprise project list page with compact header, metric cards, filters, backend pagination, full export action, table actions, loading/error/empty states, and create/edit/delete dialogs.
- [x] 4.3 Build enterprise project detail page with `经营看板`, `开票`, `收票`, `回款`, and `付款` tabs.
- [x] 4.4 Build the `经营看板` tab with contract amount, issued invoice total, collection total, received invoice total, payment total, cash profit, accounting profit, receivable balance, and payable balance.
- [x] 4.5 Build issued invoice tab with filters, backend pagination, full export, create/edit/delete dialog, attachment field display, and status badges.
- [x] 4.6 Build received invoice tab with filters, backend pagination, full export, create/edit/delete dialog, attachment field display, and status badges.
- [x] 4.7 Build collection tab with filters, backend pagination, full export, create/edit/delete dialog, optional issued invoice selection, and status badges.
- [x] 4.8 Build payment tab with filters, backend pagination, full export, create/edit/delete dialog, optional received invoice selection, and status badges.
- [x] 4.9 Review layouts at desktop and mobile widths to avoid unnecessary horizontal page scroll, overlapping labels, or clipped controls.

## 5. Verification, Deployment, and Demo Data

- [x] 5.1 Run backend enterprise project integration tests and relevant existing admin tests.
- [x] 5.2 Run frontend unit tests and production build.
- [x] 5.4 Deploy API with migrations and deploy UI to K3s.
- [x] 5.5 Seed production with realistic enterprise projects and financial records covering every module.
- [x] 5.6 Verify production health, pod readiness, project list, project detail summary formulas, module pagination, exports, and demo data visibility.
