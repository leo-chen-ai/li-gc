UPDATE integration_platforms
SET name = '宁波市住建',
    remark = '宁波市住建实名制平台第三方数据直连接口',
    updated_at = NOW()
WHERE code = 'ningbo_housing';

UPDATE integration_platforms
SET name = '甬薪精管开放平台 V2',
    remark = '甬薪精管开放平台 V2。项目凭证和功能开关由项目平台配置维护。',
    updated_at = NOW()
WHERE code = 'yongxin_v2';
