CREATE TABLE upload_files (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,

    biz_type            VARCHAR(80),
    biz_id              UUID,
    field_key           VARCHAR(120),

    original_filename   VARCHAR(255),
    object_key          VARCHAR(500) NOT NULL,
    bucket              VARCHAR(120),
    endpoint            VARCHAR(255),
    public_base_url     VARCHAR(500) NOT NULL,
    public_url          VARCHAR(1000) NOT NULL,
    storage_driver      VARCHAR(80) NOT NULL,
    content_type        VARCHAR(200),
    size_bytes          BIGINT NOT NULL DEFAULT 0,

    uploaded_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_upload_files_biz ON upload_files(biz_type, biz_id);
CREATE INDEX idx_upload_files_field_key ON upload_files(field_key);
CREATE INDEX idx_upload_files_uploaded_by ON upload_files(uploaded_by);
CREATE INDEX idx_upload_files_is_deleted ON upload_files(is_deleted);

CREATE TRIGGER update_upload_files_updated_at
    BEFORE UPDATE ON upload_files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
