-- =============================================================================
-- MIGRATION 018: Enterprise Own Entities and Counterparty Links
-- =============================================================================
-- Own entities are the companies controlled by the operator. Enterprise
-- customers are treated as counterparties and can be used on either income or
-- cost/payment sides without a separate customer/supplier type split.
-- =============================================================================

CREATE TABLE enterprise_own_entities (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,

    name                VARCHAR(240) NOT NULL,
    credit_code         VARCHAR(80),
    bank_name           VARCHAR(200),
    bank_account        VARCHAR(120),
    contact_name        VARCHAR(120),
    contact_phone       VARCHAR(60),
    address             VARCHAR(500),
    status              VARCHAR(40) NOT NULL DEFAULT 'active',
    is_default          BOOLEAN NOT NULL DEFAULT FALSE,
    remark              TEXT,

    created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_enterprise_own_entities_name ON enterprise_own_entities(name);
CREATE INDEX idx_enterprise_own_entities_credit_code ON enterprise_own_entities(credit_code);
CREATE INDEX idx_enterprise_own_entities_status ON enterprise_own_entities(status);
CREATE INDEX idx_enterprise_own_entities_is_default ON enterprise_own_entities(is_default);
CREATE INDEX idx_enterprise_own_entities_is_deleted ON enterprise_own_entities(is_deleted);

CREATE TRIGGER update_enterprise_own_entities_updated_at
    BEFORE UPDATE ON enterprise_own_entities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE enterprise_projects
    ADD COLUMN own_entity_id UUID REFERENCES enterprise_own_entities(id) ON DELETE SET NULL,
    ADD COLUMN own_entity_name VARCHAR(240);

CREATE INDEX idx_enterprise_projects_own_entity_id
    ON enterprise_projects(own_entity_id)
    WHERE own_entity_id IS NOT NULL;

ALTER TABLE enterprise_project_issued_invoices
    ADD COLUMN counterparty_id UUID REFERENCES enterprise_customers(id) ON DELETE SET NULL,
    ADD COLUMN own_entity_id UUID REFERENCES enterprise_own_entities(id) ON DELETE SET NULL,
    ADD COLUMN own_entity_name VARCHAR(240);

CREATE INDEX idx_enterprise_issued_invoices_counterparty_id
    ON enterprise_project_issued_invoices(counterparty_id)
    WHERE counterparty_id IS NOT NULL;
CREATE INDEX idx_enterprise_issued_invoices_own_entity_id
    ON enterprise_project_issued_invoices(own_entity_id)
    WHERE own_entity_id IS NOT NULL;

ALTER TABLE enterprise_project_received_invoices
    ADD COLUMN counterparty_id UUID REFERENCES enterprise_customers(id) ON DELETE SET NULL,
    ADD COLUMN own_entity_id UUID REFERENCES enterprise_own_entities(id) ON DELETE SET NULL,
    ADD COLUMN own_entity_name VARCHAR(240);

CREATE INDEX idx_enterprise_received_invoices_counterparty_id
    ON enterprise_project_received_invoices(counterparty_id)
    WHERE counterparty_id IS NOT NULL;
CREATE INDEX idx_enterprise_received_invoices_own_entity_id
    ON enterprise_project_received_invoices(own_entity_id)
    WHERE own_entity_id IS NOT NULL;

ALTER TABLE enterprise_project_collections
    ADD COLUMN counterparty_id UUID REFERENCES enterprise_customers(id) ON DELETE SET NULL,
    ADD COLUMN own_entity_id UUID REFERENCES enterprise_own_entities(id) ON DELETE SET NULL,
    ADD COLUMN own_entity_name VARCHAR(240);

CREATE INDEX idx_enterprise_collections_counterparty_id
    ON enterprise_project_collections(counterparty_id)
    WHERE counterparty_id IS NOT NULL;
CREATE INDEX idx_enterprise_collections_own_entity_id
    ON enterprise_project_collections(own_entity_id)
    WHERE own_entity_id IS NOT NULL;

ALTER TABLE enterprise_project_payments
    ADD COLUMN counterparty_id UUID REFERENCES enterprise_customers(id) ON DELETE SET NULL,
    ADD COLUMN own_entity_id UUID REFERENCES enterprise_own_entities(id) ON DELETE SET NULL,
    ADD COLUMN own_entity_name VARCHAR(240);

CREATE INDEX idx_enterprise_payments_counterparty_id
    ON enterprise_project_payments(counterparty_id)
    WHERE counterparty_id IS NOT NULL;
CREATE INDEX idx_enterprise_payments_own_entity_id
    ON enterprise_project_payments(own_entity_id)
    WHERE own_entity_id IS NOT NULL;
