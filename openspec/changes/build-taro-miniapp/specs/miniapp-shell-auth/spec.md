## ADDED Requirements

### Requirement: Taro mini program shell
The system SHALL provide a Taro 4 mini program app under `miniapp/` with typed page routing, a bottom navigation shell, a project-first home page, and a `我的` page.

#### Scenario: Open mini program after login
- **WHEN** an authenticated user opens the mini program
- **THEN** the app shows the current project context, module entries, and bottom navigation without requiring the Web admin UI.

#### Scenario: Project is required before module entry
- **WHEN** a user taps a project-scoped module without selecting a project
- **THEN** the app prompts the user to select a project before navigating to the module page.

### Requirement: Account login and token storage
The system SHALL allow mini program users to log in with the existing account/password backend and store the access token using Taro storage.

#### Scenario: Successful login
- **WHEN** a user submits a valid account and password
- **THEN** the app stores the returned access token and user profile and uses `Authorization: Bearer <token>` for API requests.

#### Scenario: Expired or invalid token
- **WHEN** an API request returns an authentication failure that cannot be refreshed in the mini program runtime
- **THEN** the app clears local session state and returns the user to the login page with a clear Chinese error message.

### Requirement: Project switching
The system SHALL allow users to search and switch projects from the mini program shell using backend project options.

#### Scenario: Search project options
- **WHEN** a user enters a project keyword in the project selector
- **THEN** the app requests matching project options from the backend and shows selectable project rows with project name and key secondary fields.

#### Scenario: Selected project persists
- **WHEN** a user selects a project
- **THEN** the app stores the selected project and uses it for subsequent module requests until the user switches projects or logs out.

### Requirement: Common mobile states
The system SHALL provide consistent loading, empty, error, saving, and delete-confirm states across all mini program pages.

#### Scenario: Module data fails to load
- **WHEN** a module API request fails
- **THEN** the page shows a retryable error state with the module-specific object name instead of a blank screen.

#### Scenario: Destructive action
- **WHEN** a user attempts to delete a unit, team, worker, attendance record, or device
- **THEN** the app shows a confirmation dialog describing the affected record before sending the delete request.
