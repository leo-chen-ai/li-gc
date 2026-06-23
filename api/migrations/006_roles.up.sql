-- =============================================================================
-- MIGRATION 006: Role menu permissions
-- =============================================================================
-- Keeps users.role as the user's role code while making role names and menu
-- permissions configurable from the admin UI.

CREATE TABLE role_configs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(50) NOT NULL UNIQUE,
    name          VARCHAR(100) NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    is_system     BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INTEGER NOT NULL DEFAULT 100,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE role_menu_permissions (
    role_id    UUID NOT NULL REFERENCES role_configs(id) ON DELETE CASCADE,
    menu_key   VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, menu_key)
);

CREATE INDEX idx_role_configs_code ON role_configs(code);
CREATE INDEX idx_role_menu_permissions_role_id ON role_menu_permissions(role_id);

CREATE TRIGGER update_role_configs_updated_at
    BEFORE UPDATE ON role_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

INSERT INTO role_configs (code, name, description, is_system, display_order)
VALUES
    ('admin', '系统管理员', '拥有后台全部菜单和系统配置权限。', TRUE, 10),
    ('user', '普通用户', '可进入项目管理菜单。', TRUE, 20),
    ('project_manager', '项目负责人', '负责项目台账、参建单位、班组人员和考勤查看。', FALSE, 30),
    ('labor_manager', '劳务专员', '负责实名制人员、班组和考勤业务协同。', FALSE, 40),
    ('viewer', '普通查看', '只保留基础工作台入口，适合临时查看账号。', FALSE, 50);

INSERT INTO role_menu_permissions (role_id, menu_key)
SELECT id, menu_key
FROM role_configs
CROSS JOIN LATERAL (
    VALUES
        ('projects'),
        ('users'),
        ('roles')
) AS menus(menu_key)
WHERE code = 'admin';

INSERT INTO role_menu_permissions (role_id, menu_key)
SELECT id, menu_key
FROM role_configs
CROSS JOIN LATERAL (
    VALUES
        ('projects')
) AS menus(menu_key)
WHERE code IN ('user', 'project_manager', 'labor_manager');

INSERT INTO role_menu_permissions (role_id, menu_key)
SELECT id, 'projects'
FROM role_configs
WHERE code = 'viewer';
