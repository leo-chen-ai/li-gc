## ADDED Requirements

### Requirement: Project detail shows wage statistics tab
The system SHALL add a `工资统计` tab to the project detail page and keep it visually consistent with the existing project detail tab layout.

#### Scenario: Operator opens wage statistics tab
- **WHEN** an authenticated admin opens a project detail page and selects `工资统计`
- **THEN** the page shows month and status filters, query/reset controls, manual add/import/export actions, summary totals for payable/paid/unpaid amounts, and a wage batch table.

#### Scenario: Wage batch table has expected columns
- **WHEN** wage batches are displayed
- **THEN** the table includes payroll month, company name, employee count, payable amount, paid amount, unpaid amount, updated time, last updater, creator, created date, status, and actions.

#### Scenario: Wage tab has no records
- **WHEN** the selected project has no wage batches for the active filters
- **THEN** the tab shows an empty state without breaking the project detail layout.

### Requirement: Wage batches are project-scoped and persisted
The system SHALL persist wage batches under the current project and prevent wage records from leaking across projects.

#### Scenario: List project wage batches
- **WHEN** the frontend requests wage batches for a project
- **THEN** the backend returns only non-deleted wage batches whose `project_id` matches that project.

#### Scenario: Filter project wage batches
- **WHEN** the request includes a payroll month or status filter
- **THEN** the backend returns only matching wage batches and summary totals based on the same filter.

#### Scenario: Delete wage batch
- **WHEN** an admin deletes a wage batch
- **THEN** the backend soft-deletes the batch and its wage items and they no longer appear in the project wage list.

### Requirement: Operators can manually maintain wage batches
The system SHALL allow authenticated admins to manually create and edit wage batch summary data.

#### Scenario: Create wage batch manually
- **WHEN** an admin submits payroll month, company name, employee count, payable amount, paid amount, unpaid amount, and status
- **THEN** the backend creates a wage batch under the current project and returns the created record.

#### Scenario: Edit wage batch manually
- **WHEN** an admin edits an existing wage batch in the current project
- **THEN** the backend updates the writable fields, updates the modification timestamp, and keeps the batch under the same project.

#### Scenario: Manual wage amount validation
- **WHEN** an admin submits invalid negative employee count or invalid amount values
- **THEN** the backend rejects the request with a clear validation error and does not persist partial data.

### Requirement: Operators can import wage Excel rows
The system SHALL allow authenticated admins to import worker-level wage rows from `.xls` and `.xlsx` files matching the supplied wage sheet shape.

#### Scenario: Import supplied wage sheet shape
- **WHEN** an admin imports a wage sheet containing headers such as `身份证`, `所属班组`, `考勤天数（天）`, `工资按月结算`, `工资按天结算`, `工资卡号`, `工资卡银行`, `应发工资（元）`, `实发工资（元）`, `调整工资（元）`, `本次未发（元）`, and `工资调整理由`
- **THEN** the system maps those columns into wage item fields and creates or updates a wage batch summary from the imported rows.

#### Scenario: Imported totals are recomputed
- **WHEN** wage rows are imported
- **THEN** the backend computes employee count, payable amount, paid amount, and unpaid amount from the saved item rows instead of trusting client-provided summary totals.

#### Scenario: Import missing required columns
- **WHEN** the imported sheet is missing required identity or wage amount columns
- **THEN** the system rejects the import and tells the admin which columns are missing.

#### Scenario: Import blank rows
- **WHEN** the imported sheet contains blank rows after the header
- **THEN** the system ignores blank rows and imports the non-blank wage rows.

### Requirement: Operators can export wage data
The system SHALL allow authenticated admins to export wage data for the current project and active filters.

#### Scenario: Export filtered wage data
- **WHEN** an admin clicks export from the wage statistics tab
- **THEN** the backend returns a downloadable file containing wage batches and item-level wage details matching the current project and filters.

#### Scenario: Export preserves identifiers as text
- **WHEN** the export includes ID card numbers or wage card numbers
- **THEN** those identifiers are emitted as text values so Excel does not convert them to scientific notation or drop leading zeros.

#### Scenario: Export no matching rows
- **WHEN** there are no wage records for the current filters
- **THEN** the system still returns a valid downloadable file with headers and no data rows.
