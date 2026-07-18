ALTER TABLE construction_teams
    DROP CONSTRAINT IF EXISTS chk_construction_teams_official_work_type;

ALTER TABLE construction_teams
    ADD CONSTRAINT chk_construction_teams_official_work_type
    CHECK (
        is_manage_team = TRUE
        OR (work_type IS NOT NULL AND work_type BETWEEN 1 AND 38)
        OR work_type = 900
    );
