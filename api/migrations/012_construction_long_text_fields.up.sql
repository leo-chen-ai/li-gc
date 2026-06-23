-- =============================================================================
-- MIGRATION 012: Construction Long Text Fields
-- =============================================================================
-- JDCloud OSS public URLs and full address strings can exceed VARCHAR(200).
-- Store upload URL/address/remark fields as TEXT to avoid truncation failures.
-- =============================================================================

ALTER TABLE construction_projects
    ALTER COLUMN address TYPE TEXT,
    ALTER COLUMN company_office_address TYPE TEXT,
    ALTER COLUMN margin_photos TYPE TEXT,
    ALTER COLUMN injury_insurance_photos TYPE TEXT,
    ALTER COLUMN payment_guarantee_photos TYPE TEXT,
    ALTER COLUMN party_a_seal TYPE TEXT,
    ALTER COLUMN legal_representative_seal TYPE TEXT,
    ALTER COLUMN address_code_list TYPE TEXT,
    ALTER COLUMN supervision_area_list TYPE TEXT;

ALTER TABLE construction_units
    ALTER COLUMN company_address TYPE TEXT,
    ALTER COLUMN attachment TYPE TEXT,
    ALTER COLUMN register_area_list TYPE TEXT,
    ALTER COLUMN seal_photo TYPE TEXT;

ALTER TABLE construction_teams
    ALTER COLUMN remark TYPE TEXT;

ALTER TABLE construction_workers
    ALTER COLUMN address TYPE TEXT,
    ALTER COLUMN ocr_photo TYPE TEXT,
    ALTER COLUMN current_address TYPE TEXT,
    ALTER COLUMN id_card_back_file TYPE TEXT,
    ALTER COLUMN avatar TYPE TEXT,
    ALTER COLUMN auth_fail_reason TYPE TEXT,
    ALTER COLUMN signature_photo TYPE TEXT;

ALTER TABLE construction_attendance_records
    ALTER COLUMN photo_path TYPE TEXT;
