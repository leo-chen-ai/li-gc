## Context

The repo already has a Rust Axum backend, PostgreSQL migrations, authenticated `/api/v1/admin` construction APIs, upload/OCR endpoints, and a Web admin UI with project-first pages. Existing APIs cover projects, participating units, teams, workers, attendance records, attendance devices, wage batches, contract templates, work-hour configs, and platform configs. The construction Flutter app under `/Users/mac/leo/gc/construction/app_flutter` is the interaction reference: it uses a project selector, mobile home grid, two-tab shell, real-name worker onboarding, team/unit/worker pages, attendance statistics, and equipment operations.

The new target is a WeChat mini program, not a Flutter port. It must be built in a new folder using Taro 4 and Taro UI, reuse the Web backend where practical, and redesign the visual layer with Mobbin-led mobile patterns. Current package metadata shows `@tarojs/*` latest as `4.2.0` and `taro-ui` latest as `3.3.3` with peer support for `@tarojs/* >=3`; implementation must pin compatible versions and prove build/runtime compatibility.

## Goals / Non-Goals

**Goals:**

- Create a new `miniapp/` app with Taro 4, React 18, TypeScript, Taro UI, and WeChat mini program build support.
- Provide a mobile shell with account login, token persistence, project switching, bottom navigation, module entry grid, and a `我的` page.
- Deliver complete mobile CRUD/workflow coverage for:
  - 实名入职
  - 班组管理
  - 参建单位
  - 项目工人
  - 出勤统计
  - 设备运维
- Reuse existing backend endpoints for CRUD, upload, OCR, auth, and project options before adding new backend code.
- Add backend adapter endpoints only for mini program aggregation, dictionary/options payloads, workflow-specific validation, or WeChat login/session support that existing endpoints cannot safely provide.
- Keep visual direction distinct from `app_flutter` while preserving useful interaction logic such as project gating, search/filter lists, edit forms, and detail pages.
- Cover implementation with frontend unit tests for data mapping/state and backend integration tests for any new endpoints.

**Non-Goals:**

- Do not clone Flutter UI colors/layouts/icons one-to-one.
- Do not rebuild the Web admin frontend or replace existing Web API contracts.
- Do not implement full worker-side punch-in/out geolocation unless explicitly added later; this change covers the requested management modules and attendance statistics/record maintenance.
- Do not implement production WeChat AppID/OpenID binding without confirmed AppID, account-binding rules, and security review.
- Do not ship visual changes without Mobbin MCP and Product Design participation; record the selected reference family and keep the result app-like with short mobile copy.

## Decisions

1. **Create `miniapp/` as a sibling app, not inside `ui/`.**
   - Rationale: Taro build config, mini program assets, app config, page routing, and WeChat output are materially different from Vite Web. A sibling folder keeps build/deploy boundaries clear.
   - Alternative considered: place Taro under `ui/`. Rejected because Web React 19 and Vite conventions would fight Taro/React 18/Taro UI constraints.

2. **Use Taro 4.2.0 + React 18 + Taro UI 3.3.3 initially.**
   - Rationale: Taro 4 packages are current and aligned; Taro UI declares `@tarojs/* >=3` peer support but still needs real build validation.
   - Alternative considered: use React 19 to match Web. Rejected because Taro UI and Taro templates are safer with React 18.

3. **Use existing admin JWT auth first, with mini program storage.**
   - The app posts account/password to `/api/v1/auth/login`, stores `access_token` and user in Taro storage, and attaches `Authorization: Bearer`.
   - Refresh-cookie behavior from Web must not be assumed in mini program. If refresh does not work reliably in WeChat runtime, the first version can route expired sessions back to login; a later backend adapter can return mobile refresh tokens.
   - WeChat `wx.login`/OpenID login is an additive follow-up once AppID and binding rules are known.

4. **Make project context mandatory for the six modules.**
   - The home page shows the selected project and blocks project-scoped module entry until a project is selected.
   - Project options use `/api/v1/admin/projects/options` with search and limit.
   - Module data requests always include `projectId` in the route, matching existing backend ownership.

5. **Reuse Web CRUD APIs by default.**
   - Reused directly: projects/options, units, teams, workers, attendance records/calendar view, attendance devices, uploads, OCR.
   - Candidate adapters:
     - `GET /api/v1/miniapp/projects/{id}/dashboard`: aggregate counts and pending states for the mobile home.
     - `GET /api/v1/miniapp/projects/{id}/dictionaries`: project-scoped team/unit/work-type/worker-status options in one call.
     - `POST /api/v1/miniapp/projects/{id}/worker-onboarding`: optional workflow wrapper if direct worker create/update plus upload/OCR is too chatty or needs atomic validation.
   - Adapter endpoints remain additive and share the same auth/admin middleware unless a separate mobile role policy is introduced.

6. **Organize frontend by feature slices.**
   - `src/app.config.ts` and `src/app.tsx` define shell, routes, and global providers.
   - `src/shared/` holds request client, storage, upload, OCR, formatting, form controls, empty/error/loading states.
   - `src/entities/` holds typed API models and mappers for projects, units, teams, workers, attendance, devices.
   - `src/features/` holds module-specific pages/services/components.
   - `src/pages/` contains Taro page entry files that compose feature screens.

7. **Visual direction is mobile operations, not admin tables.**
   - Use compact app bars, sticky project context, bottom tabs, segmented filters, cards for list rows, sheet-style forms, clear primary actions, and fixed-size controls.
   - Taro UI components are allowed for forms, tabs, dialogs, buttons, search bars, pickers, and lists, but project-specific visual tokens should follow `DESIGN.md`: green primary, restrained neutral background, Chinese construction-management copy.
   - Mobbin references guide spacing, hierarchy, form grouping, and list/detail transitions. Product Design-generated options provide the selected visual target.

8. **Implement in vertical slices with tests.**
   - Scaffold shell and request client first.
   - Add API type mappers/tests before screens.
   - Build each module as list -> detail -> create/edit -> delete/export or workflow actions.
   - Add backend adapter tests before adapter implementation.

## Risks / Trade-offs

- **Taro UI compatibility risk** -> Pin versions, run `npm run build:weapp`, and replace incompatible components with Taro primitives when needed.
- **Mini program auth refresh differs from Web cookies** -> Keep token handling isolated in `miniapp/src/shared/auth`; use login fallback first and add mobile refresh only if validated.
- **Existing admin APIs may be too chatty for mobile forms** -> Add additive adapter endpoints after measuring real page call count.
- **Mobbin/Product Design now participates in visual direction** -> Mobbin MCP is connected and must be used with the Product Design workflow for mini program UI changes. Current direction is an app-style "运维监控台" baseline for workbench/status pages, with "办理流中枢" for real-name onboarding. Keep visible text short and avoid webpage-like hero/copy-heavy screens.
- **Current worktree has many unrelated edits** -> Keep first implementation scoped to `miniapp/` and explicit backend adapter files, and do not revert existing user changes.
- **Large module scope** -> Use vertical slices and keep every module independently buildable/testable.

## Migration Plan

1. Scaffold `miniapp/` with Taro 4 React TypeScript configuration and Taro UI.
2. Add mini program env config pointing at `/api/v1`, local dev proxy notes, and WeChat build output ignored from git where appropriate.
3. Implement shared request/auth/upload/OCR/project context infrastructure.
4. Implement six modules against existing APIs.
5. Add backend adapter endpoints only where implementation proves existing APIs are insufficient.
6. Run frontend tests/build and backend tests for any changed API code.
7. For production backend changes, use `deploy/k3s/deploy-local.sh --api` or `--auto` per AGENTS instructions, then verify health and K3s pods.

Rollback: remove or hide `miniapp/` build artifacts and any additive `/api/v1/miniapp` routes. Existing Web admin tables and routes remain unchanged.

## Open Questions

- Mobbin MCP is available. Visual QA must cite the reference family and keep pages aligned to Product Design direction rather than returning to webpage-style copy-heavy screens.
- WeChat AppID, legal domain configuration, and login/account binding rules are not specified. First implementation should use existing account login unless the user provides those details.
- Mini program release/upload flow is not yet documented in this repo. Implementation should at least prove `weapp` build output and document the manual upload path.
