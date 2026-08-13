ALTER TABLE construction_workers
    ALTER COLUMN native_place DROP DEFAULT;

COMMENT ON COLUMN construction_workers.native_place IS NULL;
