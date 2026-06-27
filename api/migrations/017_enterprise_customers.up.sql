-- =============================================================================
-- MIGRATION 017: Enterprise Customers
-- =============================================================================
-- Customer master data for enterprise operation management. Projects link to a
-- customer so invoices, collections, received invoices, and payments can be
-- summarized from the customer view.
-- =============================================================================

CREATE TABLE enterprise_customers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,

    customer_code       VARCHAR(100),
    name                VARCHAR(240) NOT NULL,
    credit_code         VARCHAR(80),
    contact_name        VARCHAR(120),
    contact_phone       VARCHAR(60),
    address             VARCHAR(500),
    customer_type       VARCHAR(60),
    status              VARCHAR(40) NOT NULL DEFAULT 'active',
    remark              TEXT,

    created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_enterprise_customers_name ON enterprise_customers(name);
CREATE INDEX idx_enterprise_customers_code ON enterprise_customers(customer_code);
CREATE INDEX idx_enterprise_customers_credit_code ON enterprise_customers(credit_code);
CREATE INDEX idx_enterprise_customers_contact_phone ON enterprise_customers(contact_phone);
CREATE INDEX idx_enterprise_customers_status ON enterprise_customers(status);
CREATE INDEX idx_enterprise_customers_is_deleted ON enterprise_customers(is_deleted);

CREATE TRIGGER update_enterprise_customers_updated_at
    BEFORE UPDATE ON enterprise_customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE enterprise_projects
    ADD COLUMN customer_id UUID REFERENCES enterprise_customers(id) ON DELETE SET NULL;

CREATE INDEX idx_enterprise_projects_customer_id
    ON enterprise_projects(customer_id)
    WHERE customer_id IS NOT NULL;

INSERT INTO enterprise_customers (name, status, remark)
SELECT DISTINCT TRIM(customer_name), 'active', '由历史经营项目客户名称自动生成'
FROM enterprise_projects
WHERE customer_name IS NOT NULL
  AND TRIM(customer_name) <> ''
  AND is_deleted = FALSE;

UPDATE enterprise_projects p
SET customer_id = c.id
FROM enterprise_customers c
WHERE p.customer_id IS NULL
  AND p.customer_name IS NOT NULL
  AND TRIM(p.customer_name) = c.name
  AND p.is_deleted = FALSE
  AND c.is_deleted = FALSE;
