UPDATE construction_teams
SET work_type = 1001,
    updated_at = NOW()
WHERE is_manage_team = TRUE
  AND work_type IS DISTINCT FROM 1001;

ALTER TABLE construction_teams
    DROP CONSTRAINT chk_construction_teams_official_work_type;

ALTER TABLE construction_teams
    ADD CONSTRAINT chk_construction_teams_official_work_type
    CHECK (
        (is_manage_team = TRUE AND work_type = 1001)
        OR (
            is_manage_team = FALSE
            AND work_type IS NOT NULL
            AND ((work_type BETWEEN 1 AND 38) OR work_type = 900)
        )
    );
