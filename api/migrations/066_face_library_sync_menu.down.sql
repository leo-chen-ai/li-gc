DELETE FROM role_menu_permissions WHERE menu_key = 'face_library_sync';

CREATE OR REPLACE FUNCTION enqueue_worker_face_change() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.avatar IS NOT DISTINCT FROM OLD.avatar
           AND NEW.is_deleted IS NOT DISTINCT FROM OLD.is_deleted THEN
            RETURN NEW;
        END IF;
    END IF;
    IF EXISTS (
        SELECT 1 FROM construction_attendance_points
        WHERE project_id = NEW.project_id AND is_deleted = FALSE AND machine_mode_enabled = TRUE
    ) THEN
        INSERT INTO construction_face_enrollments (project_id, worker_id, action)
        VALUES (NEW.project_id, NEW.id,
            CASE WHEN NEW.is_deleted OR NULLIF(TRIM(COALESCE(NEW.avatar, '')), '') IS NULL
                 THEN 'delete' ELSE 'upsert' END)
        ON CONFLICT (worker_id, action) WHERE status IN ('pending', 'processing')
        DO UPDATE SET revision = construction_face_enrollments.revision + 1,
                      attempt_count = 0, last_error = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
