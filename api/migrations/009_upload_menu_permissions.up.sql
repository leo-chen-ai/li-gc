INSERT INTO role_menu_permissions (role_id, menu_key)
SELECT id, 'uploads'
FROM role_configs
WHERE code = 'admin'
ON CONFLICT (role_id, menu_key) DO NOTHING;
