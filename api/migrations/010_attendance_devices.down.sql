DELETE FROM role_menu_permissions
WHERE menu_key = 'attendance_devices'
  AND role_id IN (
      SELECT id
      FROM role_configs
      WHERE code = 'admin'
  );

DROP TABLE IF EXISTS construction_attendance_devices;
