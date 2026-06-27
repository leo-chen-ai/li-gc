## ADDED Requirements

### Requirement: Contract Template CRUD

Admins SHALL be able to create, list, view, update, and soft-delete contract templates with a name, optional code, uploaded Word template file, fallback text content, enabled state, and default flag.

#### Scenario: Create and list a template

- **GIVEN** an authenticated admin
- **WHEN** they create a contract template and list templates
- **THEN** the created template appears in the list with its persisted fields

### Requirement: Project Default Template

Admins SHALL be able to assign one default contract template to a project. If no project-specific template is configured, the system SHALL use the global default enabled template.

#### Scenario: Resolve project template fallback

- **GIVEN** a project without a project template config
- **WHEN** a worker contract is downloaded
- **THEN** the global default template is used

### Requirement: Worker Contract Download From Word Template

Admins SHALL be able to download a rendered Word contract for a worker from the project worker actions. The rendered document SHALL replace worker, project, unit, and team placeholders with current data. Unknown or empty variables SHALL remain unchanged in the Word document.

#### Scenario: Download rendered worker contract

- **GIVEN** a project, unit, team, worker, and uploaded Word template containing placeholders
- **WHEN** the admin downloads the worker contract
- **THEN** the response is a downloadable docx document containing rendered worker and project information while preserving unresolved placeholders
