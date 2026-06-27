## ADDED Requirements

### Requirement: Enterprise project records
The system SHALL allow admins to create, list, search, filter, view, edit, delete, and export enterprise project records used for company business management.

#### Scenario: Create enterprise project
- **WHEN** an admin creates an enterprise project with name, customer, contract amount, owner, status, and dates
- **THEN** the system persists the project and returns it in project lists and detail APIs

#### Scenario: Paginated project list
- **WHEN** an admin opens the enterprise project list with `page=1&page_size=10`
- **THEN** the backend returns at most 10 items plus total count, page, and page size

#### Scenario: Search and filter enterprise projects
- **WHEN** an admin searches by project name, customer, project code, or owner and filters by status
- **THEN** the backend returns only matching non-deleted enterprise projects

#### Scenario: Export all matching enterprise projects
- **WHEN** an admin exports enterprise projects with active filters
- **THEN** the export contains all matching projects, not only the currently visible page

### Requirement: Project financial records
The system SHALL support project-scoped issued invoices, received invoices, collections, and payments with CRUD, search, filters, pagination, attachments, and export.

#### Scenario: Manage issued invoice
- **WHEN** an admin creates an issued invoice for an enterprise project
- **THEN** the invoice is associated with that project and contributes to issued invoice totals unless voided or deleted

#### Scenario: Manage received invoice
- **WHEN** an admin creates a received invoice for an enterprise project
- **THEN** the invoice is associated with that project and contributes to received invoice totals unless voided or deleted

#### Scenario: Manage collection
- **WHEN** an admin creates a collection for an enterprise project
- **THEN** the collection is associated with that project and contributes to collection totals unless cancelled or deleted

#### Scenario: Manage payment
- **WHEN** an admin creates a payment for an enterprise project
- **THEN** the payment is associated with that project and contributes to payment totals unless cancelled or deleted

#### Scenario: Paginated financial lists
- **WHEN** an admin opens any financial list with `page=2&page_size=10`
- **THEN** the backend applies pagination and returns total count for the filtered query

#### Scenario: Export all matching financial records
- **WHEN** an admin exports issued invoices, received invoices, collections, or payments with active filters
- **THEN** the export contains all matching records for that module, not only the current page

### Requirement: Project profit summary
The system SHALL calculate enterprise project financial summaries on the backend using all valid project-scoped records.

#### Scenario: Calculate cash profit
- **WHEN** a project has confirmed collections and confirmed payments
- **THEN** the project summary reports `现金毛利` as confirmed collection total minus confirmed payment total

#### Scenario: Calculate accounting profit
- **WHEN** a project has non-void issued invoices and non-void received invoices
- **THEN** the project summary reports `账面毛利` as issued invoice total minus received invoice total

#### Scenario: Calculate receivable risk
- **WHEN** issued invoice total is greater than confirmed collection total
- **THEN** the project summary reports `应收未回` as issued invoice total minus confirmed collection total

#### Scenario: Calculate payable risk
- **WHEN** received invoice total is greater than confirmed payment total
- **THEN** the project summary reports `应付未付` as received invoice total minus confirmed payment total

#### Scenario: Ignore invalid records
- **WHEN** a financial record is deleted, voided, or cancelled
- **THEN** it is excluded from project summary totals

### Requirement: Enterprise project detail experience
The system SHALL provide an enterprise project detail page with a financial dashboard and tabs for issued invoices, received invoices, collections, and payments.

#### Scenario: Show dashboard metrics
- **WHEN** an admin opens an enterprise project detail page
- **THEN** the page shows contract amount, issued invoice total, collection total, received invoice total, payment total, cash profit, accounting profit, receivable balance, and payable balance

#### Scenario: Switch financial tabs
- **WHEN** an admin switches between `经营看板`, `开票`, `收票`, `回款`, and `付款`
- **THEN** the page shows the selected module without losing the selected project context

#### Scenario: Open dense financial form
- **WHEN** an admin adds or edits a financial record
- **THEN** the form provides all required fields in a large or full-screen dialog, validates required fields, and prevents duplicate submission while saving

### Requirement: Visual and interaction quality
The system SHALL follow the platform design rules for enterprise project management pages.

#### Scenario: Consistent admin visual style
- **WHEN** an admin views enterprise project management pages
- **THEN** pages use the existing primary color, shadcn/Radix components, lucide icons, compact metric cards, dense tables, stable filter controls, and Chinese business copy

#### Scenario: Complete async states
- **WHEN** project or financial data is loading, empty, failed, saving, or deleting
- **THEN** the UI shows clear loading, empty, error, disabled, toast, and delete-confirm states

#### Scenario: Responsive layout
- **WHEN** the pages are viewed at the user's current desktop resolution or common mobile widths
- **THEN** content remains readable, labels do not overlap controls, and tables/forms do not create unnecessary horizontal page scroll

### Requirement: Production readiness
The system SHALL be implemented end-to-end with database migrations, backend APIs, frontend pages, tests, deployment, and production demo data.

#### Scenario: Backend verification
- **WHEN** backend tests run for enterprise project management
- **THEN** they cover CRUD, pagination, filtering, export scope, and summary formulas

#### Scenario: Frontend verification
- **WHEN** frontend tests and build run
- **THEN** they cover summary formatting/calculation helpers and the production build succeeds

#### Scenario: Online demo data
- **WHEN** the module is deployed to production
- **THEN** the online environment contains realistic enterprise projects and financial records so every module can be reviewed immediately
