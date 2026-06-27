ALTER TABLE construction_contract_templates
    ADD COLUMN template_file JSONB,
    ADD COLUMN template_file_object_key TEXT,
    ADD COLUMN template_file_name VARCHAR(255),
    ADD COLUMN template_file_content_type VARCHAR(160);

CREATE INDEX idx_construction_contract_templates_file_object_key
    ON construction_contract_templates(template_file_object_key)
    WHERE template_file_object_key IS NOT NULL;
