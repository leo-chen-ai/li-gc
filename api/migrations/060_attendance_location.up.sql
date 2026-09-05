ALTER TABLE construction_attendance_records ADD COLUMN location JSONB;
COMMENT ON COLUMN construction_attendance_records.location IS '人脸机打卡定位快照：latitude纬度、longitude经度（GCJ-02，度）、accuracy精度（米，可空）、captured_at定位采集时间（RFC3339）、coordinate_system坐标系、point_id考勤点UUID、point_name考勤点名称；历史及非定位记录为空';
