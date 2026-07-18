DROP INDEX IF EXISTS idx_registration_leads_username;

ALTER TABLE registration_leads
DROP COLUMN IF EXISTS username;
