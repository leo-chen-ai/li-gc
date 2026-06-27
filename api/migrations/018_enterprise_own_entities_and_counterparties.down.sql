DROP INDEX IF EXISTS idx_enterprise_payments_own_entity_id;
DROP INDEX IF EXISTS idx_enterprise_payments_counterparty_id;
ALTER TABLE enterprise_project_payments
    DROP COLUMN IF EXISTS own_entity_name,
    DROP COLUMN IF EXISTS own_entity_id,
    DROP COLUMN IF EXISTS counterparty_id;

DROP INDEX IF EXISTS idx_enterprise_collections_own_entity_id;
DROP INDEX IF EXISTS idx_enterprise_collections_counterparty_id;
ALTER TABLE enterprise_project_collections
    DROP COLUMN IF EXISTS own_entity_name,
    DROP COLUMN IF EXISTS own_entity_id,
    DROP COLUMN IF EXISTS counterparty_id;

DROP INDEX IF EXISTS idx_enterprise_received_invoices_own_entity_id;
DROP INDEX IF EXISTS idx_enterprise_received_invoices_counterparty_id;
ALTER TABLE enterprise_project_received_invoices
    DROP COLUMN IF EXISTS own_entity_name,
    DROP COLUMN IF EXISTS own_entity_id,
    DROP COLUMN IF EXISTS counterparty_id;

DROP INDEX IF EXISTS idx_enterprise_issued_invoices_own_entity_id;
DROP INDEX IF EXISTS idx_enterprise_issued_invoices_counterparty_id;
ALTER TABLE enterprise_project_issued_invoices
    DROP COLUMN IF EXISTS own_entity_name,
    DROP COLUMN IF EXISTS own_entity_id,
    DROP COLUMN IF EXISTS counterparty_id;

DROP INDEX IF EXISTS idx_enterprise_projects_own_entity_id;
ALTER TABLE enterprise_projects
    DROP COLUMN IF EXISTS own_entity_name,
    DROP COLUMN IF EXISTS own_entity_id;

DROP TABLE IF EXISTS enterprise_own_entities;
