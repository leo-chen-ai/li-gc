## 1. Backend Schema

- [x] 1.1 Add migrations for contract templates and project template configs.
- [x] 1.2 Add migrations for work-hour configs.
- [x] 1.3 Add migrations for platform configs and platform logs.
- [x] 1.4 Add down migration for all new module tables.

## 2. Backend API and Tests

- [x] 2.1 Add integration tests covering contract template CRUD, project template fallback, and worker contract download.
- [x] 2.2 Add integration tests covering work-hour config CRUD.
- [x] 2.3 Add integration tests covering platform config CRUD and platform log summary/list.
- [x] 2.4 Add integration tests covering enhanced dashboard overview data.
- [x] 2.5 Implement contract template handlers, rendering helper, and routes.
- [x] 2.6 Implement work-hour config handlers and routes.
- [x] 2.7 Implement platform config/log handlers and routes.
- [x] 2.8 Implement dashboard overview metrics.

## 3. Frontend Data Layer

- [x] 3.1 Add endpoint constants, types, services, and hooks for contract templates.
- [x] 3.2 Add endpoint constants, types, services, and hooks for work-hour configs.
- [x] 3.3 Add endpoint constants, types, services, and hooks for platform configs/logs.
- [x] 3.4 Add endpoint constants, types, services, and hooks for dashboard overview.

## 4. Frontend Pages and Interactions

- [x] 4.1 Add sidebar/menu routes for 首页总览, 合同模板管理, 工时配置, 平台对接管理.
- [x] 4.2 Add admin dashboard overview page with metrics and charts.
- [x] 4.3 Add contract template management page with CRUD and project default config.
- [x] 4.4 Add work-hour configuration page with project selector and JSON rule editor.
- [x] 4.5 Add platform integration page with platform config and platform logs/statistics tabs.
- [x] 4.6 Convert project worker row operations to a menu and add contract template download.

## 5. Verification, Deploy, and Seed Data

- [x] 5.1 Run backend tests for all new CRUD and rendering behavior.
- [x] 5.2 Run frontend unit tests and production build.
- [x] 5.3 Deploy backend and frontend to K3s.
- [x] 5.4 Seed production demo data for templates, work-hour configs, platform configs, and platform logs.
- [x] 5.5 Verify production APIs/pages and mark the goal complete only after every requested module is proven.
