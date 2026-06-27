-- =============================================================================
-- MIGRATION 014: Admin Operations Modules
-- =============================================================================
-- Contract templates, project template assignments, work-hour rules, and
-- platform integration configuration/logs.
-- =============================================================================

CREATE TABLE construction_contract_templates (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_deleted         BOOLEAN NOT NULL DEFAULT FALSE,

    name               VARCHAR(200) NOT NULL,
    code               VARCHAR(100),
    content            TEXT NOT NULL,
    is_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    is_default         BOOLEAN NOT NULL DEFAULT FALSE,
    remark             TEXT,

    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ
);

CREATE INDEX idx_construction_contract_templates_code ON construction_contract_templates(code);
CREATE INDEX idx_construction_contract_templates_is_enabled ON construction_contract_templates(is_enabled);
CREATE INDEX idx_construction_contract_templates_is_deleted ON construction_contract_templates(is_deleted);
CREATE INDEX idx_construction_contract_templates_default_active
    ON construction_contract_templates(is_default)
    WHERE is_default = TRUE AND is_enabled = TRUE AND is_deleted = FALSE;

CREATE TRIGGER update_construction_contract_templates_updated_at
    BEFORE UPDATE ON construction_contract_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE construction_project_contract_configs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         UUID NOT NULL UNIQUE REFERENCES construction_projects(id) ON DELETE CASCADE,
    template_id        UUID REFERENCES construction_contract_templates(id) ON DELETE SET NULL,
    is_deleted         BOOLEAN NOT NULL DEFAULT FALSE,
    remark             TEXT,

    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ
);

CREATE INDEX idx_construction_project_contract_configs_template_id
    ON construction_project_contract_configs(template_id);
CREATE INDEX idx_construction_project_contract_configs_is_deleted
    ON construction_project_contract_configs(is_deleted);

CREATE TRIGGER update_construction_project_contract_configs_updated_at
    BEFORE UPDATE ON construction_project_contract_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE construction_work_hour_configs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    is_deleted         BOOLEAN NOT NULL DEFAULT FALSE,

    name               VARCHAR(200) NOT NULL,
    algorithm_type     VARCHAR(80) NOT NULL DEFAULT 'standard',
    rules              JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    remark             TEXT,

    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ
);

CREATE INDEX idx_construction_work_hour_configs_project_id ON construction_work_hour_configs(project_id);
CREATE INDEX idx_construction_work_hour_configs_is_enabled ON construction_work_hour_configs(is_enabled);
CREATE INDEX idx_construction_work_hour_configs_is_deleted ON construction_work_hour_configs(is_deleted);

CREATE TRIGGER update_construction_work_hour_configs_updated_at
    BEFORE UPDATE ON construction_work_hour_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE construction_platform_configs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    is_deleted         BOOLEAN NOT NULL DEFAULT FALSE,

    platform_name      VARCHAR(200) NOT NULL,
    platform_type      VARCHAR(80) NOT NULL,
    config             JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    remark             TEXT,

    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ
);

CREATE INDEX idx_construction_platform_configs_project_id ON construction_platform_configs(project_id);
CREATE INDEX idx_construction_platform_configs_platform_type ON construction_platform_configs(platform_type);
CREATE INDEX idx_construction_platform_configs_is_enabled ON construction_platform_configs(is_enabled);
CREATE INDEX idx_construction_platform_configs_is_deleted ON construction_platform_configs(is_deleted);

CREATE TRIGGER update_construction_platform_configs_updated_at
    BEFORE UPDATE ON construction_platform_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE construction_platform_logs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    platform_config_id UUID REFERENCES construction_platform_configs(id) ON DELETE SET NULL,
    is_deleted         BOOLEAN NOT NULL DEFAULT FALSE,

    platform_name      VARCHAR(200),
    operation          VARCHAR(100) NOT NULL,
    direction          VARCHAR(32) NOT NULL DEFAULT 'push',
    status             VARCHAR(32) NOT NULL DEFAULT 'success',
    request_count      INTEGER NOT NULL DEFAULT 0,
    success_count      INTEGER NOT NULL DEFAULT 0,
    failure_count      INTEGER NOT NULL DEFAULT 0,
    message            TEXT,
    payload            JSONB,
    occurred_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ
);

CREATE INDEX idx_construction_platform_logs_project_id ON construction_platform_logs(project_id);
CREATE INDEX idx_construction_platform_logs_config_id ON construction_platform_logs(platform_config_id);
CREATE INDEX idx_construction_platform_logs_status ON construction_platform_logs(status);
CREATE INDEX idx_construction_platform_logs_occurred_at ON construction_platform_logs(occurred_at);
CREATE INDEX idx_construction_platform_logs_is_deleted ON construction_platform_logs(is_deleted);

CREATE TRIGGER update_construction_platform_logs_updated_at
    BEFORE UPDATE ON construction_platform_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
