DROP INDEX IF EXISTS idx_construction_contract_templates_file_object_key;

ALTER TABLE construction_contract_templates
    DROP COLUMN IF EXISTS template_file_content_type,
    DROP COLUMN IF EXISTS template_file_name,
    DROP COLUMN IF EXISTS template_file_object_key,
    DROP COLUMN IF EXISTS template_file;
