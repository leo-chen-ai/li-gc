# Enterprise Customer Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add customer-centered enterprise management so customer pages show projects, invoicing, received invoices, collections, payments, yearly balances, and profit.

**Architecture:** Add `enterprise_customers` as the master data table and link `enterprise_projects.customer_id` to it while preserving `customer_name` for compatibility. Backend exposes customer CRUD plus customer summary endpoints; frontend adds Customer Management as the main enterprise entry and project forms select a customer.

**Tech Stack:** Rust/Axum/sqlx/PostgreSQL backend, React/TanStack Query/TanStack Router frontend, shadcn UI.

---

### Task 1: Backend Customer Data Model and API

**Files:**
- Create: `api/migrations/017_enterprise_customers.up.sql`
- Create: `api/migrations/017_enterprise_customers.down.sql`
- Modify: `api/src/feature/admin/enterprise/handler.rs`
- Modify: `api/src/feature/admin/routes.rs`
- Test: `api/tests/enterprise_project_management_test.rs`

- [ ] Write a failing API test that creates a customer, links two projects, creates financial records, and checks yearly customer summary.
- [ ] Add migration for `enterprise_customers` and nullable `enterprise_projects.customer_id` with backfill by existing `customer_name`.
- [ ] Implement customer list/detail/create/update/delete endpoints and customer summary endpoint.
- [ ] Run `cargo test --manifest-path api/Cargo.toml --test enterprise_project_management_test -- --nocapture`.

### Task 2: Frontend Customer Types, Services, and Menu

**Files:**
- Modify: `ui/src/features/enterprise-projects/types.ts`
- Modify: `ui/src/features/enterprise-projects/services.ts`
- Modify: `ui/src/features/enterprise-projects/hooks.ts`
- Modify: `ui/src/features/enterprise-projects/lib.ts`
- Modify: `ui/src/features/enterprise-projects/lib.test.ts`
- Modify: `ui/src/lib/api/endpoints.ts`
- Modify: `ui/src/components/layout/AppSidebar.tsx`
- Modify: `ui/src/features/admin/data/rbac.ts`

- [ ] Write failing frontend tests for customer summary formulas and customer option labels.
- [ ] Add customer types, service methods, query hooks, and menu permission key.
- [ ] Run `npm test` in `ui`.

### Task 3: Customer Pages and Project Linking

**Files:**
- Create: `ui/src/features/enterprise-projects/components/EnterpriseCustomersPage.tsx`
- Create: `ui/src/features/enterprise-projects/components/EnterpriseCustomerDetailPage.tsx`
- Create: `ui/src/routes/app/admin/enterprise-customers.tsx`
- Create: `ui/src/routes/app/admin/enterprise-customers.$customerId.tsx`
- Modify: `ui/src/features/enterprise-projects/components/EnterpriseProjectsPage.tsx`
- Modify: `ui/src/features/enterprise-projects/components/EnterpriseProjectDetailPage.tsx`
- Modify: `ui/src/features/enterprise-projects/components/EnterpriseRecordModulePage.tsx`
- Modify: `ui/src/routeTree.gen.ts`

- [ ] Add customer list with summary columns and customer detail with yearly summary cards.
- [ ] Project form selects customer from customer list and still supports legacy customer text display.
- [ ] Run `npm run build` in `ui`.

### Task 4: Deploy and Verify

**Files:**
- No code files; deployment only.

- [ ] Run `cargo fmt --manifest-path api/Cargo.toml`.
- [ ] Run focused backend and frontend tests.
- [ ] Deploy with `deploy/k3s/deploy-local.sh --auto`.
- [ ] Verify `http://36.151.143.235:30081/health` and customer page routes return 200.
