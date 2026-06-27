## ADDED Requirements

### Requirement: Work-Hour Configuration CRUD

Admins SHALL be able to create, list, view, update, and soft-delete per-project work-hour configurations.

#### Scenario: Manage work-hour config

- **GIVEN** an authenticated admin and a project
- **WHEN** they create, update, list, get, and delete a work-hour configuration
- **THEN** each operation succeeds and deleted configs no longer appear in active lists

### Requirement: Visual Rule Configuration

Work-hour configurations SHALL let admins configure algorithm type, standard hours, work times, overtime, night-shift, attendance grace, and rounding rules through form controls. The system MAY store those rules as structured JSON internally, but admins SHALL NOT need to type raw JSON.

#### Scenario: Save visual rule form

- **GIVEN** an admin fills the visual work-hour rule form
- **WHEN** the admin saves the project work-hour config
- **THEN** the system persists equivalent structured rules and later restores them back into the visual form
