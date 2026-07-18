DELETE FROM role_menu_permissions
WHERE menu_key = 'managed_attendance'
  AND role_id IN (
      SELECT id
      FROM role_configs
      WHERE code = 'admin'
  );

DROP TABLE IF EXISTS construction_managed_attendance_records;
DROP TABLE IF EXISTS construction_managed_attendance_configs;
DROP TABLE IF EXISTS construction_managed_attendance_photo_groups;
