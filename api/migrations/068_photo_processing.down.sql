DELETE FROM role_menu_permissions WHERE menu_key = 'photo_processing';

DROP TABLE IF EXISTS photo_composite_tasks;
DROP TABLE IF EXISTS photo_processing_group_backgrounds;
DROP TABLE IF EXISTS photo_processing_group_photos;
DROP TABLE IF EXISTS photo_processing_groups;
