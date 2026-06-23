-- =============================================================================
-- MIGRATION 007: Construction Core Domain
-- =============================================================================
-- Normalized copy of the legacy construction project/unit/team/worker/attendance
-- fields, intentionally excluding third-party platform integration fields.
-- =============================================================================

CREATE TABLE construction_projects (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id                   UUID REFERENCES users(id) ON DELETE SET NULL,
    is_deleted                      BOOLEAN NOT NULL DEFAULT FALSE,

    name                            VARCHAR(200),
    address_code                    VARCHAR(200),
    street                          VARCHAR(200),
    start_date                      DATE,
    finish_date                     DATE,
    invest_total                    BIGINT,
    investment_nature               INTEGER,
    labor_cost                      BIGINT,
    status                          INTEGER,
    category                        INTEGER,
    industry                        INTEGER,
    address                         VARCHAR(200),
    longitude                       VARCHAR(200),
    latitude                        VARCHAR(200),
    work_permit                     VARCHAR(200),
    supervision_area                VARCHAR(200),

    contractor                      VARCHAR(200),
    contractor_credit_code          VARCHAR(200),
    manager                         VARCHAR(200),
    manager_phone                   VARCHAR(200),
    contract_principal              VARCHAR(200),
    contract_principal_id_card      VARCHAR(200),
    contract_principal_phone        VARCHAR(200),
    party_a                         VARCHAR(200),
    legal_representative            VARCHAR(200),
    legal_representative_id_card    VARCHAR(200),
    company_office_address          VARCHAR(255),
    company_phone                   VARCHAR(200),
    bid_notice                      VARCHAR(200),

    build_unit                      VARCHAR(200),
    build_unit_credit_code          VARCHAR(200),
    labor_subcontractor             VARCHAR(200),
    labor_subcontractor_credit_code VARCHAR(200),
    build_nature                    INTEGER,
    build_scale                     INTEGER,
    acreage                         BIGINT,
    length                          BIGINT,
    purpose                         INTEGER,
    progress_type                   INTEGER,

    real_name_manager               VARCHAR(200),
    real_name_manager_phone         VARCHAR(200),
    labor_manager                   VARCHAR(200),
    labor_manager_phone             VARCHAR(200),
    complaint_phone                 VARCHAR(200),
    labor_complaint_phone           VARCHAR(200),
    company_complaint_phone         VARCHAR(200),
    project_complaint_phone         VARCHAR(200),
    nationality                     VARCHAR(200),
    manager_id_card                 VARCHAR(200),
    labor_manager_id_card           VARCHAR(200),
    contract_amount                 BIGINT,
    injury_insurance_number         VARCHAR(200),
    margin_amount                   BIGINT,
    pay_date                        DATE,
    margin_photos                   VARCHAR(200),
    injury_insurance_photos         VARCHAR(200),
    payment_guarantee_photos        VARCHAR(200),
    contract_number                 VARCHAR(200),
    contract_prefix                 VARCHAR(20),
    party_a_seal                    VARCHAR(500),
    legal_representative_seal       VARCHAR(500),
    address_code_list               VARCHAR(200),
    supervision_area_list           VARCHAR(200),

    bid_notice_file                 JSONB,
    margin_photos_file              JSONB,
    injury_insurance_photos_file    JSONB,
    payment_guarantee_photos_file   JSONB,

    is_inspected                    BOOLEAN NOT NULL DEFAULT TRUE,
    is_handheld_device_enabled      BOOLEAN NOT NULL DEFAULT FALSE,

    created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                      TIMESTAMPTZ
);

CREATE INDEX idx_construction_projects_owner_user_id ON construction_projects(owner_user_id);
CREATE INDEX idx_construction_projects_status ON construction_projects(status);
CREATE INDEX idx_construction_projects_is_deleted ON construction_projects(is_deleted);

CREATE TRIGGER update_construction_projects_updated_at
    BEFORE UPDATE ON construction_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE construction_units (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    is_deleted           BOOLEAN NOT NULL DEFAULT FALSE,
    project_id           UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,

    company_name         VARCHAR(200),
    company_credit_code  VARCHAR(200),
    company_type         INTEGER,
    register_date        DATE,
    register_area        VARCHAR(200),
    company_address      VARCHAR(200),
    manager_name         VARCHAR(200),
    manager_phone        VARCHAR(200),
    manager_id_card      VARCHAR(200),
    legal_person_name    VARCHAR(200),
    legal_person_id_card VARCHAR(200),
    company_phone        VARCHAR(200),
    contract_amount      BIGINT,
    attachment           VARCHAR(200),
    register_area_list   VARCHAR(200),
    attachment_file      JSONB,
    timer_set_a          INTEGER,
    timer_set_b          INTEGER,
    timer_set_c          INTEGER,
    salary_calc_type     SMALLINT,
    quantity_unit_type   SMALLINT,
    seal_photo           VARCHAR(500),

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMPTZ
);

CREATE INDEX idx_construction_units_project_id ON construction_units(project_id);
CREATE INDEX idx_construction_units_company_name ON construction_units(company_name);
CREATE INDEX idx_construction_units_is_deleted ON construction_units(is_deleted);

CREATE TRIGGER update_construction_units_updated_at
    BEFORE UPDATE ON construction_units
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE construction_teams (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE,
    project_id              UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    unit_id                 UUID NOT NULL REFERENCES construction_units(id) ON DELETE CASCADE,

    name                    VARCHAR(200),
    work_type               INTEGER,
    is_manage_team          BOOLEAN NOT NULL DEFAULT FALSE,
    settlement_type         SMALLINT,
    quantity_unit_type      SMALLINT,
    remark                  VARCHAR(200),
    attendance_start_time   VARCHAR(200),
    attendance_end_time     VARCHAR(200),
    attendance_is_next_day  BOOLEAN NOT NULL DEFAULT FALSE,
    leader_id               UUID,
    leader_name             VARCHAR(200),
    leader_phone            VARCHAR(200),
    leader_id_card          VARCHAR(200),
    team_no                 VARCHAR(200),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ
);

CREATE INDEX idx_construction_teams_project_id ON construction_teams(project_id);
CREATE INDEX idx_construction_teams_unit_id ON construction_teams(unit_id);
CREATE INDEX idx_construction_teams_name ON construction_teams(name);
CREATE INDEX idx_construction_teams_is_deleted ON construction_teams(is_deleted);

CREATE TRIGGER update_construction_teams_updated_at
    BEFORE UPDATE ON construction_teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE construction_workers (
    id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id                UUID REFERENCES users(id) ON DELETE SET NULL,
    is_deleted                   BOOLEAN NOT NULL DEFAULT FALSE,
    project_id                   UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    unit_id                      UUID NOT NULL REFERENCES construction_units(id) ON DELETE CASCADE,
    team_id                      UUID NOT NULL REFERENCES construction_teams(id) ON DELETE CASCADE,

    id_card                      VARCHAR(200),
    name                         VARCHAR(200),
    gender                       SMALLINT NOT NULL DEFAULT 0,
    nation                       VARCHAR(200),
    visa_office                  VARCHAR(200),
    address                      VARCHAR(200),
    validity_period              VARCHAR(200),
    ocr_photo                    VARCHAR(200),
    work_type                    INTEGER,
    worker_type                  INTEGER,
    political_status             INTEGER,
    education                    INTEGER,
    settlement_type              SMALLINT,
    quantity_unit_type           SMALLINT,
    unit_price                   BIGINT,
    salary_bank_card             VARCHAR(200),
    salary_bank                  VARCHAR(200),
    has_insurance                BOOLEAN NOT NULL DEFAULT FALSE,
    has_major_medical_history    BOOLEAN NOT NULL DEFAULT FALSE,
    current_address              VARCHAR(200),
    dormitory_id                 UUID,
    id_card_back_file            VARCHAR(200),
    phone                        VARCHAR(200),
    is_manage_team               BOOLEAN NOT NULL DEFAULT FALSE,
    is_key_personnel             BOOLEAN NOT NULL DEFAULT FALSE,
    avatar                       VARCHAR(200),
    work_status                  SMALLINT NOT NULL DEFAULT 1,
    labor_contract_file          JSONB,
    settlement_file              JSONB,
    exit_time                    DATE,
    auth_status                  SMALLINT NOT NULL DEFAULT 1,
    auth_fail_reason             VARCHAR(200),
    manager_type                 VARCHAR(200),
    validity_period_end          VARCHAR(200),
    entry_time                   DATE,
    signature_photo              VARCHAR(200),
    signature_time               DATE,
    native_place                 INTEGER,

    created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                   TIMESTAMPTZ
);

CREATE INDEX idx_construction_workers_project_id ON construction_workers(project_id);
CREATE INDEX idx_construction_workers_unit_id ON construction_workers(unit_id);
CREATE INDEX idx_construction_workers_team_id ON construction_workers(team_id);
CREATE INDEX idx_construction_workers_id_card ON construction_workers(id_card);
CREATE INDEX idx_construction_workers_name ON construction_workers(name);
CREATE INDEX idx_construction_workers_work_status ON construction_workers(work_status);
CREATE INDEX idx_construction_workers_is_deleted ON construction_workers(is_deleted);

CREATE TRIGGER update_construction_workers_updated_at
    BEFORE UPDATE ON construction_workers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE construction_attendance_records (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,
    worker_id      UUID NOT NULL REFERENCES construction_workers(id) ON DELETE CASCADE,
    project_id     UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,

    direction      SMALLINT NOT NULL DEFAULT 0,
    trigger_time   TIMESTAMPTZ NOT NULL,
    equipment_id   VARCHAR(200),
    serial_number  VARCHAR(200),
    photo_path     VARCHAR(200),
    overall_photo  TEXT,
    closeup_photo  TEXT,
    original_time  VARCHAR(200),

    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ
);

CREATE INDEX idx_construction_attendance_project_id ON construction_attendance_records(project_id);
CREATE INDEX idx_construction_attendance_worker_id ON construction_attendance_records(worker_id);
CREATE INDEX idx_construction_attendance_trigger_time ON construction_attendance_records(trigger_time);
CREATE INDEX idx_construction_attendance_direction ON construction_attendance_records(direction);
CREATE INDEX idx_construction_attendance_is_deleted ON construction_attendance_records(is_deleted);

CREATE TRIGGER update_construction_attendance_records_updated_at
    BEFORE UPDATE ON construction_attendance_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
