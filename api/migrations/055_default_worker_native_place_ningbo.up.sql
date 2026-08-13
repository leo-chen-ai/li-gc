UPDATE construction_workers
SET native_place = 330200,
    updated_at = NOW()
WHERE native_place IS NULL
   OR native_place < 110000
   OR native_place > 659999;

ALTER TABLE construction_workers
    ALTER COLUMN native_place SET DEFAULT 330200;

COMMENT ON COLUMN construction_workers.native_place IS '人员籍贯行政区划码；未填写或无法映射时默认330200浙江省宁波市';
