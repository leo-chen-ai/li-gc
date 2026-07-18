-- =============================================================================
-- Roll back attendance record photo split.
-- =============================================================================

UPDATE construction_attendance_records r
SET overall_photo = p.photo_data
FROM (
    SELECT DISTINCT ON (attendance_record_id)
        attendance_record_id,
        photo_data
    FROM construction_attendance_record_photos
    WHERE photo_kind = 'overall'
    ORDER BY attendance_record_id, created_at DESC, id DESC
) p
WHERE r.id = p.attendance_record_id
  AND r.overall_photo IS NULL;

UPDATE construction_attendance_records r
SET closeup_photo = p.photo_data
FROM (
    SELECT DISTINCT ON (attendance_record_id)
        attendance_record_id,
        photo_data
    FROM construction_attendance_record_photos
    WHERE photo_kind = 'closeup'
    ORDER BY attendance_record_id, created_at DESC, id DESC
) p
WHERE r.id = p.attendance_record_id
  AND r.closeup_photo IS NULL;

DROP TABLE IF EXISTS construction_attendance_record_photos;
