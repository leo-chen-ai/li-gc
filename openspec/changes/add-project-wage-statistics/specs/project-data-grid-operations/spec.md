## ADDED Requirements

### Requirement: Unit team and worker modules do not expose import actions
The system SHALL remove visible import entry points from the project detail `建设单位`, `班组信息`, and `项目工人` modules.

#### Scenario: Operator opens unit team or worker module
- **WHEN** an authenticated admin opens the `建设单位`, `班组信息`, or `项目工人` tab
- **THEN** the tab action area does not show an import button or import workflow trigger.

### Requirement: Unit team and worker modules export all module data
The system SHALL provide Excel-openable export actions for project detail `建设单位`, `班组信息`, and `项目工人` modules.

#### Scenario: Export unit data
- **WHEN** an admin exports the `建设单位` module
- **THEN** the downloaded file contains all unit rows for the current project, not only the visible page.

#### Scenario: Export team data
- **WHEN** an admin exports the `班组信息` module
- **THEN** the downloaded file contains all team rows for the current project, not only the visible page.

#### Scenario: Export worker data
- **WHEN** an admin exports the `项目工人` module
- **THEN** the downloaded file contains all worker rows for the current project, not only the visible page or selected organization node.

#### Scenario: Export preserves identifiers
- **WHEN** exported module data includes credit codes, ID cards, phone numbers, or bank card numbers
- **THEN** those fields are emitted as text so Excel does not corrupt leading zeros or long identifiers.

### Requirement: Project detail tables paginate after ten rows
The system SHALL paginate project detail data tables once a module has more than 10 rows.

#### Scenario: Unit table exceeds ten rows
- **WHEN** the `建设单位` module has more than 10 rows
- **THEN** the table shows 10 rows per page and pagination controls.

#### Scenario: Team table exceeds ten rows
- **WHEN** the `班组信息` module has more than 10 rows
- **THEN** the table shows 10 rows per page and pagination controls.

#### Scenario: Worker table exceeds ten rows
- **WHEN** the `项目工人` module has more than 10 rows in the active organization scope
- **THEN** the table shows 10 rows per page and pagination controls for that scope.

#### Scenario: Wage table exceeds ten rows
- **WHEN** the `工资统计` module has more than 10 rows for the active filters
- **THEN** the table shows 10 rows per page and pagination controls.
