-- =============================================================================
-- ROLLBACK 012: Construction Long Text Fields
-- =============================================================================
-- Truncate on rollback because VARCHAR length limits cannot hold existing long
-- OSS URLs or address values.
-- =============================================================================

ALTER TABLE construction_projects
    ALTER COLUMN address TYPE VARCHAR(200) USING LEFT(address, 200),
    ALTER COLUMN company_office_address TYPE VARCHAR(255) USING LEFT(company_office_address, 255),
    ALTER COLUMN margin_photos TYPE VARCHAR(200) USING LEFT(margin_photos, 200),
    ALTER COLUMN injury_insurance_photos TYPE VARCHAR(200) USING LEFT(injury_insurance_photos, 200),
    ALTER COLUMN payment_guarantee_photos TYPE VARCHAR(200) USING LEFT(payment_guarantee_photos, 200),
    ALTER COLUMN party_a_seal TYPE VARCHAR(500) USING LEFT(party_a_seal, 500),
    ALTER COLUMN legal_representative_seal TYPE VARCHAR(500) USING LEFT(legal_representative_seal, 500),
    ALTER COLUMN address_code_list TYPE VARCHAR(200) USING LEFT(address_code_list, 200),
    ALTER COLUMN supervision_area_list TYPE VARCHAR(200) USING LEFT(supervision_area_list, 200);

ALTER TABLE construction_units
    ALTER COLUMN company_address TYPE VARCHAR(200) USING LEFT(company_address, 200),
    ALTER COLUMN attachment TYPE VARCHAR(200) USING LEFT(attachment, 200),
    ALTER COLUMN register_area_list TYPE VARCHAR(200) USING LEFT(register_area_list, 200),
    ALTER COLUMN seal_photo TYPE VARCHAR(500) USING LEFT(seal_photo, 500);

ALTER TABLE construction_teams
    ALTER COLUMN remark TYPE VARCHAR(200) USING LEFT(remark, 200);

ALTER TABLE construction_workers
    ALTER COLUMN address TYPE VARCHAR(200) USING LEFT(address, 200),
    ALTER COLUMN ocr_photo TYPE VARCHAR(200) USING LEFT(ocr_photo, 200),
    ALTER COLUMN current_address TYPE VARCHAR(200) USING LEFT(current_address, 200),
    ALTER COLUMN id_card_back_file TYPE VARCHAR(200) USING LEFT(id_card_back_file, 200),
    ALTER COLUMN avatar TYPE VARCHAR(200) USING LEFT(avatar, 200),
    ALTER COLUMN auth_fail_reason TYPE VARCHAR(200) USING LEFT(auth_fail_reason, 200),
    ALTER COLUMN signature_photo TYPE VARCHAR(200) USING LEFT(signature_photo, 200);

ALTER TABLE construction_attendance_records
    ALTER COLUMN photo_path TYPE VARCHAR(200) USING LEFT(photo_path, 200);
