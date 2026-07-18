ALTER TABLE registration_leads
ADD COLUMN username VARCHAR(50);

CREATE INDEX idx_registration_leads_username ON registration_leads(username);
