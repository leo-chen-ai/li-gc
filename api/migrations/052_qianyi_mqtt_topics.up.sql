ALTER TABLE construction_attendance_devices
    ADD COLUMN qianyi_subtopic VARCHAR(300),
    ADD COLUMN qianyi_pubtopic VARCHAR(300);

COMMENT ON COLUMN construction_attendance_devices.qianyi_subtopic IS
    '芊熠设备订阅的平台下行MQTT主题，由camera_register注册消息上报';
COMMENT ON COLUMN construction_attendance_devices.qianyi_pubtopic IS
    '芊熠设备发布的上行MQTT主题，由camera_register注册消息上报';

CREATE INDEX idx_construction_attendance_devices_qianyi_pubtopic
    ON construction_attendance_devices(qianyi_pubtopic)
    WHERE is_deleted = FALSE AND qianyi_pubtopic IS NOT NULL;

CREATE UNIQUE INDEX idx_construction_attendance_devices_qianyi_serial_normalized
    ON construction_attendance_devices(BTRIM(serial_number))
    WHERE is_deleted = FALSE
      AND device_type = '芊熠厂家'
      AND serial_number IS NOT NULL
      AND BTRIM(serial_number) <> '';
