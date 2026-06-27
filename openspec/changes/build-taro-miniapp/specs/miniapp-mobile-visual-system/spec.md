## ADDED Requirements

### Requirement: Distinct mobile visual system
The mini program SHALL use a mobile-first visual system that follows Shanhuai's construction-management brand while remaining visually distinct from the Flutter reference app.

#### Scenario: Mobile module list page
- **WHEN** a user views any module list page
- **THEN** the page uses mobile cards or compact rows, sticky search/filter controls, clear status badges, and primary actions sized for touch.

#### Scenario: Mobile form page
- **WHEN** a user creates or edits a record
- **THEN** the form groups fields by business meaning, uses mobile pickers/uploads where appropriate, and keeps submit/cancel actions stable and readable.

### Requirement: Taro UI usage
The mini program SHALL use Taro UI for common mobile controls where compatible with Taro 4 and WeChat mini program builds.

#### Scenario: Taro UI component incompatibility
- **WHEN** a Taro UI component fails build or runtime verification
- **THEN** the implementation replaces only that component with Taro primitives or a local component while preserving the visual behavior.

### Requirement: Mobbin and Product Design reference workflow
The implementation SHALL use Mobbin references and the Product Design workflow as required visual inputs for meaningful mini program UI changes.

#### Scenario: Mobbin and Product Design direction required
- **WHEN** a mini program page or shared mobile visual pattern is redesigned
- **THEN** the implementation records the Mobbin reference family and Product Design direction before or alongside implementation.

#### Scenario: Mobbin references available
- **WHEN** Mobbin references become available
- **THEN** the visual QA pass compares mini program screens against those references for hierarchy, spacing, touch targets, and interaction patterns without copying unrelated branding.

#### Scenario: Mini program app copy density
- **WHEN** the page is rendered in a common WeChat mobile viewport
- **THEN** visible copy is kept short and app-like, avoiding webpage hero text, long explanatory paragraphs, and copy-heavy admin descriptions.

### Requirement: Responsive mini program states
The visual system SHALL prevent text overflow, unstable button sizing, and overlapping content on common WeChat mini program viewport sizes.

#### Scenario: Long business fields
- **WHEN** project, company, team, worker, or device names exceed the available row width
- **THEN** the UI truncates gracefully and provides a detail view or expanded field where the full value can be read.
