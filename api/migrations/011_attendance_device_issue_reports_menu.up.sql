INSERT INTO role_menu_permissions (role_id, menu_key)
SELECT id, 'attendance_device_issue_reports'
FROM role_configs
WHERE code = 'admin'
ON CONFLICT (role_id, menu_key) DO NOTHING;
