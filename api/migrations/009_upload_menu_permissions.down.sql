DELETE FROM role_menu_permissions
WHERE menu_key = 'uploads'
  AND role_id IN (
      SELECT id
      FROM role_configs
      WHERE code = 'admin'
  );
