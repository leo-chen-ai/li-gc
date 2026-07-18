WITH normalized AS (
    SELECT
        id,
        CASE
            WHEN COALESCE(name, '') ILIKE '%钢筋%' THEN 1
            WHEN COALESCE(name, '') ILIKE '%模板%' THEN 15
            WHEN COALESCE(name, '') ILIKE ANY (ARRAY['%外架%', '%脚手架%']) THEN 4
            WHEN COALESCE(name, '') ILIKE '%混凝土%' THEN 5
            WHEN COALESCE(name, '') ILIKE ANY (ARRAY['%砌筑%', '%瓦工%']) THEN 6
            WHEN COALESCE(name, '') ILIKE ANY (ARRAY['%建筑电工%', '%水电%']) THEN 7
            WHEN COALESCE(name, '') ILIKE ANY (ARRAY['%电焊%', '%焊工%']) THEN 8
            WHEN COALESCE(name, '') ILIKE '%管道%' THEN 9
            WHEN COALESCE(name, '') ILIKE ANY (ARRAY['%测量%', '%放线%']) THEN 10
            WHEN COALESCE(name, '') ILIKE ANY (ARRAY['%装饰%', '%装修%', '%抹灰%', '%油漆%', '%涂装%']) THEN 11
            WHEN COALESCE(name, '') ILIKE '%防水%' THEN 13
            WHEN COALESCE(name, '') ILIKE ANY (ARRAY['%土方%', '%开挖%', '%挖掘%']) THEN 14
            WHEN COALESCE(name, '') ILIKE '%机电%' THEN 3
            WHEN work_type BETWEEN 1 AND 38 OR work_type = 900 THEN work_type
            ELSE 900
        END AS normalized_work_type
    FROM construction_teams
    WHERE is_manage_team = FALSE
)
UPDATE construction_teams team
SET work_type = normalized.normalized_work_type,
    updated_at = NOW()
FROM normalized
WHERE team.id = normalized.id
  AND team.work_type IS DISTINCT FROM normalized.normalized_work_type;

ALTER TABLE construction_teams
    ADD CONSTRAINT chk_construction_teams_official_work_type
    CHECK (
        is_manage_team = TRUE
        OR (work_type IS NOT NULL AND work_type BETWEEN 1 AND 38)
        OR work_type = 900
    );
