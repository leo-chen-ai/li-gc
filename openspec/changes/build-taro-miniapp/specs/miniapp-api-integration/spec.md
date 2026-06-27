## ADDED Requirements

### Requirement: Existing API reuse
The mini program SHALL reuse existing `/api/v1` backend APIs for auth, project options, units, teams, workers, attendance records, attendance devices, uploads, and OCR when those APIs satisfy the mobile workflow.

#### Scenario: Direct CRUD reuse
- **WHEN** a module needs standard create, list, detail, update, or delete behavior already available under `/api/v1/admin/projects/{projectId}`
- **THEN** the mini program uses that existing endpoint instead of adding a duplicate endpoint.

### Requirement: Additive mini program adapters
The backend SHALL add mini program adapter endpoints only when existing APIs cannot safely or efficiently support a mobile workflow.

#### Scenario: Aggregated mobile dashboard
- **WHEN** the mobile home page needs project counts, pending states, and shortcut metadata from multiple tables
- **THEN** an additive `/api/v1/miniapp` endpoint may return an aggregated payload without changing existing Web admin endpoints.

#### Scenario: Project dictionaries
- **WHEN** a mobile form needs multiple project-scoped option sets at once
- **THEN** an additive adapter endpoint may return units, teams, work types, worker statuses, and related dictionaries in one authenticated response.

### Requirement: Authorization compatibility
Mini program API requests SHALL use the same backend authentication and role restrictions as the Web admin APIs unless a separate mobile role policy is explicitly defined.

#### Scenario: Unauthorized request
- **WHEN** a mini program request lacks a valid token or required role
- **THEN** the backend rejects it with the same structured error style used by existing APIs.

### Requirement: Backend tests for new endpoints
Every new mini program backend adapter endpoint SHALL have integration tests covering success, validation failure, and unauthorized/forbidden access where applicable.

#### Scenario: Run backend tests
- **WHEN** backend tests run for mini program adapter endpoints
- **THEN** they prove the adapter returns correct project-scoped data without breaking existing admin construction tests.
