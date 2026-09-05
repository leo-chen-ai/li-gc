DROP TRIGGER IF EXISTS enqueue_worker_face_change ON construction_workers;
DROP FUNCTION IF EXISTS enqueue_worker_face_change();
ALTER TABLE construction_face_enrollments DROP COLUMN revision;
