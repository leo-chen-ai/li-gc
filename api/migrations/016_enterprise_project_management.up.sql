-- =============================================================================
-- MIGRATION 016: Enterprise Project Management
-- =============================================================================
-- Business project ledger for issued invoices, received invoices, collections,
-- payments, and project-level profitability summaries.
-- =============================================================================

CREATE TABLE enterprise_projects (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_deleted            BOOLEAN NOT NULL DEFAULT FALSE,

    project_code          VARCHAR(100),
    name                  VARCHAR(240) NOT NULL,
    customer_name         VARCHAR(240),
    contract_amount_cents BIGINT NOT NULL DEFAULT 0,
    owner_name            VARCHAR(120),
    status                VARCHAR(40) NOT NULL DEFAULT 'active',
    planned_start_date    DATE,
    planned_end_date      DATE,
    actual_start_date     DATE,
    actual_end_date       DATE,
    construction_project_id UUID REFERENCES construction_projects(id) ON DELETE SET NULL,
    remark                TEXT,

    created_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ,

    CONSTRAINT enterprise_projects_contract_amount_nonnegative
        CHECK (contract_amount_cents >= 0)
);

CREATE INDEX idx_enterprise_projects_code ON enterprise_projects(project_code);
CREATE INDEX idx_enterprise_projects_name ON enterprise_projects(name);
CREATE INDEX idx_enterprise_projects_customer ON enterprise_projects(customer_name);
CREATE INDEX idx_enterprise_projects_status ON enterprise_projects(status);
CREATE INDEX idx_enterprise_projects_owner ON enterprise_projects(owner_name);
CREATE INDEX idx_enterprise_projects_is_deleted ON enterprise_projects(is_deleted);
CREATE INDEX idx_enterprise_projects_construction_project_id
    ON enterprise_projects(construction_project_id)
    WHERE construction_project_id IS NOT NULL;

CREATE TRIGGER update_enterprise_projects_updated_at
    BEFORE UPDATE ON enterprise_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE enterprise_project_issued_invoices (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           UUID NOT NULL REFERENCES enterprise_projects(id) ON DELETE CASCADE,
    is_deleted           BOOLEAN NOT NULL DEFAULT FALSE,

    customer_name        VARCHAR(240),
    invoice_no           VARCHAR(120),
    invoice_date         DATE NOT NULL,
    amount_cents         BIGINT NOT NULL DEFAULT 0,
    tax_rate             DOUBLE PRECISION,
    status               VARCHAR(40) NOT NULL DEFAULT 'issued',
    attachments          JSONB NOT NULL DEFAULT '[]'::jsonb,
    remark               TEXT,

    created_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMPTZ,

    CONSTRAINT enterprise_issued_invoices_amount_nonnegative
        CHECK (amount_cents >= 0)
);

CREATE INDEX idx_enterprise_issued_invoices_project_id
    ON enterprise_project_issued_invoices(project_id);
CREATE INDEX idx_enterprise_issued_invoices_invoice_no
    ON enterprise_project_issued_invoices(invoice_no);
CREATE INDEX idx_enterprise_issued_invoices_invoice_date
    ON enterprise_project_issued_invoices(invoice_date);
CREATE INDEX idx_enterprise_issued_invoices_status
    ON enterprise_project_issued_invoices(status);
CREATE INDEX idx_enterprise_issued_invoices_customer
    ON enterprise_project_issued_invoices(customer_name);
CREATE INDEX idx_enterprise_issued_invoices_is_deleted
    ON enterprise_project_issued_invoices(is_deleted);

CREATE TRIGGER update_enterprise_project_issued_invoices_updated_at
    BEFORE UPDATE ON enterprise_project_issued_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE enterprise_project_received_invoices (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           UUID NOT NULL REFERENCES enterprise_projects(id) ON DELETE CASCADE,
    is_deleted           BOOLEAN NOT NULL DEFAULT FALSE,

    supplier_name        VARCHAR(240),
    invoice_no           VARCHAR(120),
    invoice_date         DATE NOT NULL,
    amount_cents         BIGINT NOT NULL DEFAULT 0,
    tax_rate             DOUBLE PRECISION,
    expense_type         VARCHAR(120),
    status               VARCHAR(40) NOT NULL DEFAULT 'received',
    attachments          JSONB NOT NULL DEFAULT '[]'::jsonb,
    remark               TEXT,

    created_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMPTZ,

    CONSTRAINT enterprise_received_invoices_amount_nonnegative
        CHECK (amount_cents >= 0)
);

CREATE INDEX idx_enterprise_received_invoices_project_id
    ON enterprise_project_received_invoices(project_id);
CREATE INDEX idx_enterprise_received_invoices_invoice_no
    ON enterprise_project_received_invoices(invoice_no);
CREATE INDEX idx_enterprise_received_invoices_invoice_date
    ON enterprise_project_received_invoices(invoice_date);
CREATE INDEX idx_enterprise_received_invoices_status
    ON enterprise_project_received_invoices(status);
CREATE INDEX idx_enterprise_received_invoices_supplier
    ON enterprise_project_received_invoices(supplier_name);
CREATE INDEX idx_enterprise_received_invoices_expense_type
    ON enterprise_project_received_invoices(expense_type);
CREATE INDEX idx_enterprise_received_invoices_is_deleted
    ON enterprise_project_received_invoices(is_deleted);

CREATE TRIGGER update_enterprise_project_received_invoices_updated_at
    BEFORE UPDATE ON enterprise_project_received_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE enterprise_project_collections (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES enterprise_projects(id) ON DELETE CASCADE,
    issued_invoice_id   UUID REFERENCES enterprise_project_issued_invoices(id) ON DELETE SET NULL,
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,

    payer_name          VARCHAR(240),
    collection_date     DATE NOT NULL,
    amount_cents        BIGINT NOT NULL DEFAULT 0,
    account_name        VARCHAR(160),
    status              VARCHAR(40) NOT NULL DEFAULT 'confirmed',
    attachments         JSONB NOT NULL DEFAULT '[]'::jsonb,
    remark              TEXT,

    created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT enterprise_collections_amount_nonnegative
        CHECK (amount_cents >= 0)
);

CREATE INDEX idx_enterprise_collections_project_id
    ON enterprise_project_collections(project_id);
CREATE INDEX idx_enterprise_collections_issued_invoice_id
    ON enterprise_project_collections(issued_invoice_id)
    WHERE issued_invoice_id IS NOT NULL;
CREATE INDEX idx_enterprise_collections_collection_date
    ON enterprise_project_collections(collection_date);
CREATE INDEX idx_enterprise_collections_status
    ON enterprise_project_collections(status);
CREATE INDEX idx_enterprise_collections_payer
    ON enterprise_project_collections(payer_name);
CREATE INDEX idx_enterprise_collections_is_deleted
    ON enterprise_project_collections(is_deleted);

CREATE TRIGGER update_enterprise_project_collections_updated_at
    BEFORE UPDATE ON enterprise_project_collections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE enterprise_project_payments (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           UUID NOT NULL REFERENCES enterprise_projects(id) ON DELETE CASCADE,
    received_invoice_id  UUID REFERENCES enterprise_project_received_invoices(id) ON DELETE SET NULL,
    is_deleted           BOOLEAN NOT NULL DEFAULT FALSE,

    payee_name           VARCHAR(240),
    payment_date         DATE NOT NULL,
    amount_cents         BIGINT NOT NULL DEFAULT 0,
    account_name         VARCHAR(160),
    status               VARCHAR(40) NOT NULL DEFAULT 'confirmed',
    attachments          JSONB NOT NULL DEFAULT '[]'::jsonb,
    remark               TEXT,

    created_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMPTZ,

    CONSTRAINT enterprise_payments_amount_nonnegative
        CHECK (amount_cents >= 0)
);

CREATE INDEX idx_enterprise_payments_project_id
    ON enterprise_project_payments(project_id);
CREATE INDEX idx_enterprise_payments_received_invoice_id
    ON enterprise_project_payments(received_invoice_id)
    WHERE received_invoice_id IS NOT NULL;
CREATE INDEX idx_enterprise_payments_payment_date
    ON enterprise_project_payments(payment_date);
CREATE INDEX idx_enterprise_payments_status
    ON enterprise_project_payments(status);
CREATE INDEX idx_enterprise_payments_payee
    ON enterprise_project_payments(payee_name);
CREATE INDEX idx_enterprise_payments_is_deleted
    ON enterprise_project_payments(is_deleted);

CREATE TRIGGER update_enterprise_project_payments_updated_at
    BEFORE UPDATE ON enterprise_project_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
