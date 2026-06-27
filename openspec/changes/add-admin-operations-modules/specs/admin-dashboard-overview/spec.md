## ADDED Requirements

### Requirement: Overview Metrics

The admin overview SHALL show construction-oriented metrics including projects, active workers, today attendance, wage totals, contract templates, work-hour configs, and platform integration status.

#### Scenario: Fetch overview

- **GIVEN** an authenticated admin
- **WHEN** they open the admin overview
- **THEN** the backend returns numeric metrics and chart-ready arrays for display

### Requirement: Chart-Ready Data

The overview API SHALL return project status distribution, recent attendance trend, and platform log status distribution without requiring the frontend to call multiple module APIs.

#### Scenario: Render charts from one endpoint

- **GIVEN** existing projects, attendance records, and platform logs
- **WHEN** the frontend calls the overview endpoint
- **THEN** it receives arrays suitable for chart rendering
