DELETE FROM role_menu_permissions
WHERE menu_key = 'attendance_device_issue_reports'
  AND role_id IN (
      SELECT id
      FROM role_configs
      WHERE code = 'admin'
  );
