ALTER TABLE construction_attendance_records ADD COLUMN closeup_photo TEXT;
COMMENT ON COLUMN construction_attendance_records.closeup_photo IS '考勤特写照片，兼容旧版接口的图片地址或Base64数据';
UPDATE construction_attendance_records r
SET closeup_photo = NULLIF(p.photo_data, '')
FROM (
    SELECT DISTINCT ON (attendance_record_id) attendance_record_id, photo_data
    FROM construction_attendance_record_photos
    WHERE photo_kind = 'closeup'
    ORDER BY attendance_record_id, (source = 'admin_upload') DESC, created_at DESC, id DESC
) p WHERE p.attendance_record_id = r.id;
