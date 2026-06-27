DROP INDEX IF EXISTS idx_enterprise_projects_customer_id;

ALTER TABLE enterprise_projects
    DROP COLUMN IF EXISTS customer_id;

DROP TABLE IF EXISTS enterprise_customers;
