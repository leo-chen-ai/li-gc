ALTER TABLE construction_face_enrollments ADD COLUMN revision BIGINT NOT NULL DEFAULT 1;
COMMENT ON COLUMN construction_face_enrollments.revision IS '人脸同步任务版本号；头像更新时递增，用于防止旧任务结果覆盖新的同步请求';

-- 与人员修改同一事务入队，覆盖导入、后台编辑等所有头像写入入口。
CREATE FUNCTION enqueue_worker_face_change() RETURNS TRIGGER AS $$
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

CREATE TRIGGER enqueue_worker_face_change
AFTER INSERT OR UPDATE OF avatar, is_deleted ON construction_workers
FOR EACH ROW EXECUTE FUNCTION enqueue_worker_face_change();
