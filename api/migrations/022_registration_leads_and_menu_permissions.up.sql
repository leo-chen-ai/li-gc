CREATE TABLE registration_leads (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(100) NOT NULL,
    phone      VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_registration_leads_created_at ON registration_leads(created_at DESC);
CREATE INDEX idx_registration_leads_phone ON registration_leads(phone);

INSERT INTO role_menu_permissions (role_id, menu_key)
SELECT id, menu_key
FROM role_configs
CROSS JOIN LATERAL (
    VALUES
        ('registration_leads'),
        ('personnel_workers'),
        ('personnel_contracts'),
        ('personnel_qualifications'),
        ('personnel_registrations'),
        ('personnel_bad_records'),
        ('personnel_approvers'),
        ('environment_monitoring'),
        ('video_monitoring'),
        ('quality_safety'),
        ('safety_management'),
        ('material_management'),
        ('construction_site'),
        ('party_building'),
        ('emergency_management')
) AS menus(menu_key)
WHERE code = 'admin'
ON CONFLICT (role_id, menu_key) DO NOTHING;
