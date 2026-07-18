DELETE FROM role_menu_permissions
WHERE menu_key = 'attendance_alerts'
  AND role_id IN (
      SELECT id
      FROM role_configs
      WHERE code = 'admin'
  );

DROP TABLE IF EXISTS construction_attendance_alert_logs;
DROP TABLE IF EXISTS construction_attendance_alert_configs;
