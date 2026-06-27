-- =============================================================================
-- MIGRATION 013: Construction Wage Statistics
-- =============================================================================
-- Project-scoped wage batch summaries plus worker-level wage item details.
-- =============================================================================

CREATE TABLE construction_wage_batches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,

    payroll_month       DATE NOT NULL,
    company_name        VARCHAR(200),
    employee_count      INTEGER NOT NULL DEFAULT 0,
    payable_amount_cents BIGINT NOT NULL DEFAULT 0,
    paid_amount_cents   BIGINT NOT NULL DEFAULT 0,
    unpaid_amount_cents BIGINT NOT NULL DEFAULT 0,
    status              VARCHAR(32) NOT NULL DEFAULT 'draft',
    remark              TEXT,

    created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_construction_wage_batches_project_id ON construction_wage_batches(project_id);
CREATE INDEX idx_construction_wage_batches_project_month ON construction_wage_batches(project_id, payroll_month);
CREATE INDEX idx_construction_wage_batches_status ON construction_wage_batches(status);
CREATE INDEX idx_construction_wage_batches_is_deleted ON construction_wage_batches(is_deleted);

CREATE TRIGGER update_construction_wage_batches_updated_at
    BEFORE UPDATE ON construction_wage_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE construction_wage_items (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id                 UUID NOT NULL REFERENCES construction_wage_batches(id) ON DELETE CASCADE,
    project_id               UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    is_deleted               BOOLEAN NOT NULL DEFAULT FALSE,

    worker_id                UUID REFERENCES construction_workers(id) ON DELETE SET NULL,
    worker_name              VARCHAR(200),
    id_card                  VARCHAR(200),
    team_name                VARCHAR(200),
    attendance_days          VARCHAR(64),
    monthly_settlement       VARCHAR(64),
    daily_settlement         VARCHAR(64),
    wage_card_number         VARCHAR(200),
    wage_bank                VARCHAR(200),
    payable_amount_cents     BIGINT NOT NULL DEFAULT 0,
    paid_amount_cents        BIGINT NOT NULL DEFAULT 0,
    adjustment_amount_cents  BIGINT NOT NULL DEFAULT 0,
    unpaid_amount_cents      BIGINT NOT NULL DEFAULT 0,
    adjustment_reason        TEXT,

    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at               TIMESTAMPTZ
);

CREATE INDEX idx_construction_wage_items_batch_id ON construction_wage_items(batch_id);
CREATE INDEX idx_construction_wage_items_project_id ON construction_wage_items(project_id);
CREATE INDEX idx_construction_wage_items_id_card ON construction_wage_items(id_card);
CREATE INDEX idx_construction_wage_items_is_deleted ON construction_wage_items(is_deleted);

CREATE TRIGGER update_construction_wage_items_updated_at
    BEFORE UPDATE ON construction_wage_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
