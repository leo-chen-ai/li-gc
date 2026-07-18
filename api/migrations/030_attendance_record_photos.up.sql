-- =============================================================================
-- MIGRATION 030: Attendance Record Photos
-- =============================================================================
-- Keep large face-recognition snapshots out of construction_attendance_records.
-- Existing photo columns stay for API compatibility, but MQTT snapshots are
-- stored here and read back through joins.
-- =============================================================================

CREATE TABLE construction_attendance_record_photos (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_record_id UUID NOT NULL REFERENCES construction_attendance_records(id) ON DELETE CASCADE,
    project_id           UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    worker_id            UUID REFERENCES construction_workers(id) ON DELETE SET NULL,
    photo_kind           VARCHAR(32) NOT NULL DEFAULT 'closeup',
    photo_data           TEXT NOT NULL,
    content_type         VARCHAR(80),
    source               VARCHAR(80) NOT NULL DEFAULT 'mqtt_rec_push',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_construction_attendance_photos_record_id
    ON construction_attendance_record_photos(attendance_record_id);
CREATE INDEX idx_construction_attendance_photos_project_created
    ON construction_attendance_record_photos(project_id, created_at DESC);
CREATE INDEX idx_construction_attendance_photos_worker_created
    ON construction_attendance_record_photos(worker_id, created_at DESC);
CREATE UNIQUE INDEX idx_construction_attendance_photos_unique_kind_source
    ON construction_attendance_record_photos(attendance_record_id, photo_kind, source);

INSERT INTO construction_attendance_record_photos (
    attendance_record_id, project_id, worker_id, photo_kind, photo_data, source
)
SELECT id, project_id, worker_id, 'overall', overall_photo, 'legacy_column'
FROM construction_attendance_records
WHERE overall_photo IS NOT NULL
  AND BTRIM(overall_photo) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO construction_attendance_record_photos (
    attendance_record_id, project_id, worker_id, photo_kind, photo_data, source
)
SELECT id, project_id, worker_id, 'closeup', closeup_photo, 'legacy_column'
FROM construction_attendance_records
WHERE closeup_photo IS NOT NULL
  AND BTRIM(closeup_photo) <> ''
ON CONFLICT DO NOTHING;

UPDATE construction_attendance_records
SET overall_photo = NULL,
    closeup_photo = NULL
WHERE (overall_photo IS NOT NULL AND BTRIM(overall_photo) <> '')
   OR (closeup_photo IS NOT NULL AND BTRIM(closeup_photo) <> '');
