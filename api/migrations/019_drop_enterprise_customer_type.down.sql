ALTER TABLE enterprise_customers
    ADD COLUMN IF NOT EXISTS customer_type VARCHAR(60);
