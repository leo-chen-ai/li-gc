## Why

The admin platform now covers projects, units, teams, workers, attendance, and wages, but it still lacks the operational modules the user needs for contract templates, dashboard overview, per-project work-hour rules, and external platform integration management. These modules must be persisted, testable, deployable, and seeded with realistic demo data so the production environment can be reviewed directly.

## What Changes

- Add a `合同模板管理` admin menu for CRUD maintenance of worker contract templates, including a default template flag and project-level default template assignment.
- Add worker-level contract template download from project worker actions, rendering worker and project data into the selected template or the platform default.
- Improve project worker action display so more actions can be added without crowding the table.
- Add an admin dashboard overview page with charts and operational statistics for projects, workers, attendance, wages, contracts, work-hour configs, and platform integration status.
- Add a `工时配置` admin menu for per-project work-hour algorithm configuration.
- Add a `平台对接管理` admin menu with platform configuration and platform logs/statistics views.
- Add backend tables, project-scoped/global APIs, frontend pages, CRUD flows, tests, deployment, and production demo data for all new modules.

## Capabilities

### New Capabilities

- `contract-template-management`: Manage contract templates, defaults, project assignments, and worker contract downloads.
- `admin-dashboard-overview`: Show admin/home overview metrics and charts for construction operations.
- `work-hour-configuration`: Manage per-project work-hour calculation rules.
- `platform-integration-management`: Manage platform project configs, JSON config payloads, API interaction summary, and platform push logs.

### Modified Capabilities

- `project-worker-operations`: Worker table actions support additional menu-style operations such as contract template download.

## Impact

- Backend:
  - New SQL migrations for contract templates/project template config, work-hour configs, platform configs, and platform logs.
  - New admin construction handlers/routes and integration tests covering create, list, get, update, delete, and contract rendering.
  - Extended dashboard stats endpoint or new overview endpoint.
- Frontend:
  - New admin routes and sidebar entries for dashboard overview, contract templates, work-hour configuration, and platform integration.
  - Project worker action menu improvements and contract download action.
  - Data services/hooks/types/tests for the new modules.
- Operations:
  - Production deployment after tests/builds pass.
  - Production seed/demo data for templates, work-hour configs, platform configs, and logs.
