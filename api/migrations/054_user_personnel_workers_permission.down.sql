DELETE FROM role_menu_permissions
WHERE role_id IN (SELECT id FROM role_configs WHERE code = 'user')
  AND menu_key = 'personnel_workers';
