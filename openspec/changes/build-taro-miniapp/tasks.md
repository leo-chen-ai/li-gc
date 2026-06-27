## 1. Mini Program Scaffold

- [x] 1.1 Create `miniapp/` with Taro 4 React TypeScript app structure, WeChat target config, and local scripts for dev/build/test.
- [x] 1.2 Pin compatible dependencies for `@tarojs/*` 4.x, React 18, TypeScript, Taro UI 3.x, ESLint/test tooling, and document version rationale.
- [x] 1.3 Add git ignores and build output handling for Taro/WeChat artifacts without touching existing `ui/` build output.
- [x] 1.4 Add app-level routes, bottom navigation, project-first home page, login page, project selector page, and initial `我的` page screens.

## 2. Shared Mini Program Infrastructure

- [x] 2.1 Implement Taro request client with base URL config, `Authorization` injection, structured error normalization, timeout handling, and login fallback on auth failure.
- [x] 2.2 Implement auth store using Taro storage for access token, user profile, selected project, and logout/session cleanup.
- [x] 2.3 Implement reusable loading, empty, error, retry, save-in-progress, confirmation dialog, page header, search bar, filter chips, and mobile list row components.
- [x] 2.4 Implement upload and ID-card OCR helpers using existing `/uploads` and `/ocr/id-card` APIs.
- [x] 2.5 Add unit tests for request/error mapping, auth storage, project persistence, and key formatting helpers.

## 3. API Types and Service Layer

- [x] 3.1 Port or generate typed mini program models for projects, units, teams, workers, attendance records/calendar rows, attendance devices, uploads, OCR results, and common list responses.
- [x] 3.2 Implement services for auth, project options, units, teams, workers, attendance, attendance devices, uploads, and OCR against existing `/api/v1` endpoints.
- [x] 3.3 Add mapper tests for nullable backend fields, status/auth badges, date/month formatting, long-field truncation metadata, and list pagination params.
- [x] 3.4 Identify mobile workflows that require adapter APIs after the service layer is wired, and record each reason before adding backend code.

## 4. Backend Adapter Endpoints

- [x] 4.1 Add backend integration tests for any required `/api/v1/miniapp` dashboard, dictionary, or worker-onboarding adapter endpoint before implementation.
- [x] 4.2 Implement additive mini program routes and handlers only for workflows proven insufficient through existing admin APIs.
- [x] 4.3 Ensure adapter routes use existing auth/admin middleware, project scoping, validation, and response envelope conventions.
- [x] 4.4 Run existing admin construction API tests after adapter changes to prove Web contracts still pass.

## 5. Business Module Pages

- [x] 5.1 Implement `实名入职` phone verification, dictionary loading, avatar/ID-card upload, OCR fill, worker create/update, validation, and success/error states.
- [x] 5.2 Implement `班组管理` list/search/filter, create/edit/delete, unit association, leader fields, settlement/work type, and attendance time settings.
- [x] 5.3 Implement `参建单位` list/search/filter, create/edit/delete, company identity, legal/manager/contact fields, contract fields, and supported attachment upload.
- [x] 5.4 Implement `项目工人` list/search/filter, detail, create/edit/delete, status/auth badges, and supported worker actions.
- [x] 5.5 Implement `出勤统计` date/month selection, team/unit filters, list/calendar summary, attendance detail, and permitted attendance record CRUD.
- [x] 5.6 Implement `设备运维` device list/search/filter, bind/create/edit/delete, device detail, and available issue/report views backed by existing APIs.
- [x] 5.7 Add focused tests for each module's form validation, API payload mapping, delete confirmation, and loading/error/empty states.

## 6. Visual System and Mobbin QA

- [x] 6.1 Build Shanhuai mini program tokens for colors, typography, spacing, radii, status badges, and touch target sizing based on `DESIGN.md`.
- [x] 6.2 Apply Taro UI components for forms, pickers, buttons, tabs, dialogs, search, and lists where Taro 4 build verification passes.
- [x] 6.3 Collect Mobbin MCP references or user-provided screenshots before final visual polish; if unavailable, document the limitation in verification notes.
- [x] 6.4 Complete mobile visual QA for common WeChat viewport sizes, long Chinese business fields, empty/error states, and no-overlap/no-overflow behavior.

## 7. Integration and Build Verification

- [x] 7.1 Run mini program unit tests and type checks.
- [x] 7.2 Run `miniapp` WeChat build and fix Taro/Taro UI compatibility issues.
- [x] 7.3 Run backend tests for any changed API areas.
- [x] 7.5 Start or document the local preview path and provide the mini program build output location for WeChat Developer Tools.

## 8. Production and Handoff

- [x] 8.1 If backend adapters changed, deploy with the local K3s flow from AGENTS and verify `/health` plus pod readiness.
- [x] 8.2 Seed or identify review data covering all six modules without overwriting production user data.
- [x] 8.3 Verify each module against real backend data or clearly mark any blocked external dependency such as Mobbin MCP or WeChat AppID.
