INSERT INTO role_menu_permissions (role_id, menu_key)
SELECT id, 'personnel_workers'
FROM role_configs
WHERE code = 'user'
ON CONFLICT (role_id, menu_key) DO NOTHING;
