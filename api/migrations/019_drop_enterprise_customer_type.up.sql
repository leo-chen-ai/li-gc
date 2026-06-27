-- =============================================================================
-- MIGRATION 019: Drop Enterprise Customer Type
-- =============================================================================
-- Enterprise customers are used as unified counterparties. They can be buyers,
-- suppliers, payers, or payees, so a fixed customer_type field is not part of
-- the current product model.
-- =============================================================================

ALTER TABLE enterprise_customers
    DROP COLUMN IF EXISTS customer_type;
