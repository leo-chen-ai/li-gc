## ADDED Requirements

### Requirement: Real-name onboarding
The system SHALL support mobile real-name worker onboarding with phone lookup, image upload, ID card OCR, work-info selection, and worker create/update.

#### Scenario: Verify worker phone
- **WHEN** a user enters a valid phone number during onboarding
- **THEN** the app checks whether a matching worker exists in the selected project and either loads editable worker information or prepares a new worker form.

#### Scenario: Recognize ID card
- **WHEN** a user uploads or captures an ID card image
- **THEN** the app sends the image to the backend OCR endpoint and fills recognized identity fields while allowing manual correction.

#### Scenario: Submit onboarding
- **WHEN** required identity, unit/team, work type, phone, and photo fields are valid
- **THEN** the app creates or updates the project worker through the backend and shows the resulting authentication/status state.

### Requirement: Team management
The system SHALL support mobile CRUD for project teams, including unit association, leader fields, work type, settlement settings, and attendance time settings.

#### Scenario: Create team
- **WHEN** a user submits a valid team form for the selected project
- **THEN** the backend persists the team and the mobile list refreshes with the new team.

#### Scenario: Filter teams
- **WHEN** a user searches by team name or filters by participating unit
- **THEN** the list shows matching non-deleted teams for the selected project.

### Requirement: Participating unit management
The system SHALL support mobile CRUD for participating units with company identity, legal representative, manager/contact, contract, and attachment fields that are supported by the backend.

#### Scenario: Create unit
- **WHEN** a user submits a valid participating unit form
- **THEN** the backend persists the unit and the app shows it in the selected project's unit list.

#### Scenario: Delete unit with confirmation
- **WHEN** a user confirms deletion of a participating unit
- **THEN** the backend soft-deletes the unit and the app removes it from normal list results.

### Requirement: Project worker management
The system SHALL support mobile worker list, detail, create, edit, delete, status display, and relevant worker actions.

#### Scenario: Worker list search
- **WHEN** a user searches by worker name, phone, ID card, team, or unit
- **THEN** the app displays matching project workers with status and authentication badges.

#### Scenario: Edit worker
- **WHEN** a user edits a worker's supported fields and saves
- **THEN** the backend updates the worker and the app reflects the updated detail and list row.

### Requirement: Attendance statistics
The system SHALL support project attendance statistics with date/month selection, team/unit filters, list or calendar summary, and attendance record detail.

#### Scenario: View monthly attendance
- **WHEN** a user selects a month and optional team/unit filters
- **THEN** the app shows attendance rows or calendar summaries returned by the backend for the selected project.

#### Scenario: Maintain attendance record
- **WHEN** a user with permission creates, edits, or deletes an attendance record
- **THEN** the backend persists the change and the current attendance view refreshes.

### Requirement: Device operations
The system SHALL support mobile device operation management for project attendance devices and available issue/report views backed by existing APIs.

#### Scenario: Bind attendance device
- **WHEN** a user submits a device type, serial number, name, direction, and remark
- **THEN** the backend creates the project device binding and the app shows it in the device list.

#### Scenario: Update device
- **WHEN** a user edits an existing device binding
- **THEN** the backend updates the device and the app refreshes the device detail and list row.
