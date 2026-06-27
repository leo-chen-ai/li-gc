## ADDED Requirements

### Requirement: Platform Config CRUD

Admins SHALL be able to create, list, view, update, and soft-delete project platform configurations with project selection, platform name/type, JSON config, and enabled status.

#### Scenario: Manage platform config

- **GIVEN** an authenticated admin and a project
- **WHEN** they perform create, update, list, get, and delete operations on a platform config
- **THEN** the operations are persisted and project-scoped fields are returned

### Requirement: Platform Log View

Admins SHALL be able to view platform push logs by project and see summary counts for today’s API interactions, successes, and failures.

#### Scenario: View platform logs and summary

- **GIVEN** platform log records for a project
- **WHEN** the admin filters logs by project
- **THEN** the response includes logs and today summary statistics
