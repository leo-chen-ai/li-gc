## Context

The current project follows a compact construction-admin pattern: Rust Axum backend under `/api/v1/admin`, PostgreSQL migrations with soft-delete tables, and React/shadcn admin pages with a left sidebar and project-first workflows. Existing project detail screens already need more worker actions, and the user explicitly wants the new modules online with seeded demo data and full CRUD tests.

## Goals / Non-Goals

**Goals:**

- Persist all new module data in PostgreSQL tables with soft deletion and project ownership where relevant.
- Provide authenticated/admin CRUD APIs for contract templates, project template defaults, work-hour configurations, platform configs, and platform logs.
- Render a downloadable worker contract from a template using project, unit, team, and worker data.
- Provide a dashboard overview with operational statistics and chart-ready time-series/category data.
- Provide frontend admin menus and screens that follow `DESIGN.md`.
- Cover CRUD behavior with integration tests and ship production demo data.

**Non-Goals:**

- Do not implement real external platform API dispatch; platform logs may be demo/manual records for this change.
- Do not add a full DOCX/PDF templating engine in the first pass. Template rendering can generate an HTML/Word-compatible download as long as worker/project placeholders are replaced.
- Do not rewrite the existing project detail architecture beyond the action menu needed for more operations.

## Decisions

1. **Use focused module tables.**
   - `construction_contract_templates` stores global templates, content, placeholder syntax, enabled/default flags.
   - `construction_project_contract_configs` stores per-project default template assignment.
   - `construction_work_hour_configs` stores per-project algorithm type and JSON rule details.
   - `construction_platform_configs` stores project/platform JSON config and enabled status.
   - `construction_platform_logs` stores platform interaction logs for list/stat display.
   - Rationale: these map directly to user-facing modules and keep project-scoped data queryable.

2. **Use simple placeholder rendering for contract downloads.**
   - Template content is stored as text/HTML with `{{worker.name}}`, `{{project.name}}`, `{{team.name}}`, and similar placeholders.
   - Download endpoint returns an HTML document with a Word-compatible MIME type and `.doc` filename.
   - Rationale: it is enough for immediate template download/review and avoids a large binary document dependency. It can later evolve to DOCX.

3. **Keep JSON fields as JSONB.**
   - Work-hour rules and platform config payloads are JSONB to match the user’s requirement that users can write JSON directly.
   - Backend validates that JSON fields are objects, but does not over-constrain schema in the first version.

4. **Dashboard overview endpoint returns chart-ready data.**
   - Extend stats with construction metrics and arrays such as project status distribution, attendance trend, platform status summary, and wage totals.
   - Rationale: frontend charts should not reconstruct cross-module stats with many calls.

5. **Project selectors use existing options endpoint.**
   - New frontend pages use `/admin/projects/options` for searchable project selection, matching project selector guidance in memory and existing code.

## Risks / Trade-offs

- Contract template rendering may need richer formatting later -> Mitigate by storing HTML/text content and isolating rendering in one helper.
- JSON config can be invalid or too free-form -> Mitigate with JSON parse validation and clear error states.
- More sidebar items can clutter navigation -> Mitigate with grouped menus and concise labels.
- Production demo data could overwrite user edits -> Seed by insert/upsert scoped to known demo names and avoid destructive updates except when explicitly requested.

## Migration Plan

1. Add migrations for the new tables and indexes.
2. Add API handlers/routes/tests.
3. Add frontend routes/pages/services/tests.
4. Build and test locally.
5. Deploy backend migrations/API/UI.
6. Insert production demo data and verify live pages/API.

Rollback: hide frontend menu entries and run down migration to drop only the new module tables. Existing project/unit/team/worker/attendance/wage data remains untouched.

## Open Questions

- None blocking. The initial contract download format will be Word-compatible HTML; later DOCX rendering can be added if the user requires exact Word template fidelity.
