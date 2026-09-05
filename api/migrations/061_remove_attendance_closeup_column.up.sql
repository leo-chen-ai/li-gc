-- Preserve any remaining manual/legacy snapshots before removing the redundant column.
INSERT INTO construction_attendance_record_photos
    (attendance_record_id, project_id, worker_id, photo_kind, photo_data, source)
SELECT id, project_id, worker_id, 'closeup', closeup_photo, 'legacy_main_column'
FROM construction_attendance_records
WHERE closeup_photo IS NOT NULL AND BTRIM(closeup_photo) <> ''
ON CONFLICT (attendance_record_id, photo_kind, source) DO NOTHING;
ALTER TABLE construction_attendance_records DROP COLUMN closeup_photo;
