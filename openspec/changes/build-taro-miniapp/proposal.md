## Why

Shanhuai currently has a Web admin platform for construction project management, but field operators need a WeChat mini program optimized for mobile workflows. The mini program should reuse the existing Web backend wherever possible while redesigning the mobile UX around project-first, on-site operations instead of copying the Flutter reference app or shrinking the Web tables.

## What Changes

- Add a new Taro 4 mini program app under `miniapp/` using React, TypeScript, Taro UI, and a mobile-first component structure.
- Build a project-first mini program shell with login/session handling, project switching, tab navigation, mobile request utilities, upload/OCR helpers, and consistent loading/error/empty states.
- Implement six complete mobile modules:
  - `实名入职`: phone lookup, ID card OCR/upload, avatar upload, worker identity/work-info form, create/update worker, authentication state display.
  - `班组管理`: team list, search/filter, create/edit/delete, leader assignment, unit association, attendance time settings.
  - `参建单位`: unit list, search/filter, create/edit/delete, company/legal/manager/contact fields, seal/attachment upload where supported.
  - `项目工人`: worker list, search/filter, detail, create/edit/delete, status/auth badges, contract download entry where practical for mini program.
  - `出勤统计`: date/month views, team/unit filters, attendance list/calendar summary, worker attendance detail, manual record CRUD where existing admin permissions allow it.
  - `设备运维`: attendance device list, binding/create/edit/delete, online/usage/status fields, issue/report list if backed by existing APIs.
- Reuse the existing Rust admin APIs for projects, units, teams, workers, attendance records, attendance devices, uploads, OCR, and auth where suitable.
- Add backend mini program adapter APIs only where the mobile experience needs safer aggregated payloads, project-scoped dictionaries, WeChat login/session behavior, or workflow-specific validation not already covered by Web APIs.
- Use Mobbin as the required visual reference source together with the Product Design workflow. The MCP is connected for this work; UI changes must remain app-like, not webpage-like, with short visible copy and Mobbin-informed mobile hierarchy.

## Capabilities

### New Capabilities

- `miniapp-shell-auth`: Taro mini program app shell, auth/session handling, project selection, navigation, request/upload/OCR infrastructure, and common mobile states.
- `miniapp-construction-workflows`: Mobile CRUD and workflow behavior for real-name onboarding, teams, participating units, workers, attendance statistics, and device operations.
- `miniapp-api-integration`: Contract for reusing existing Web backend APIs and adding only required mini program adapter endpoints.
- `miniapp-mobile-visual-system`: Mobile visual direction, interaction patterns, Mobbin-reference workflow, and Taro UI usage constraints.

### Modified Capabilities

- None. Existing Web admin capabilities should remain compatible; new backend endpoints must be additive unless implementation discovery proves a shared contract needs an explicit delta.

## Impact

- New frontend app directory: `miniapp/`.
- New dependencies likely include `@tarojs/*` 4.x, React 18, TypeScript, `taro-ui` 3.x, and related Taro build plugins.
- Existing backend areas likely affected: `api/src/feature/auth`, `api/src/feature/admin/construction`, `api/src/feature/admin/routes.rs`, upload/OCR infrastructure, and integration tests.
- Existing Web frontend should not be redesigned for this change, but its service/types and endpoint contracts are reference material.
- Deployment needs a new build artifact path and release decision for mini program upload/build verification; production K3s deployment is only required for backend adapter changes.
