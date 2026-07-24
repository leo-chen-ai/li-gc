DELETE FROM role_menu_permissions WHERE menu_key = 'data_reporting';
DROP TABLE IF EXISTS report_forward_worker_heartbeats;
DROP TABLE IF EXISTS report_forward_events;
DROP TABLE IF EXISTS report_forward_artifacts;
DROP TABLE IF EXISTS report_forward_items;
DROP TABLE IF EXISTS report_forward_run_projects;
DROP TABLE IF EXISTS report_forward_runs;
DROP TABLE IF EXISTS report_forward_configs;
DROP FUNCTION IF EXISTS report_forward_next_run(TIME, TEXT);
