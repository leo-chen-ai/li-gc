DELETE FROM role_menu_permissions
WHERE menu_key IN (
    'registration_leads',
    'personnel_workers',
    'personnel_contracts',
    'personnel_qualifications',
    'personnel_registrations',
    'personnel_bad_records',
    'personnel_approvers',
    'environment_monitoring',
    'video_monitoring',
    'quality_safety',
    'safety_management',
    'material_management',
    'construction_site',
    'party_building',
    'emergency_management'
);

DROP TABLE IF EXISTS registration_leads;
