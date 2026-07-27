UPDATE integration_platforms
SET name = '市住建',
    remark = '市住建实名制平台第三方数据直连接口',
    updated_at = NOW()
WHERE code = 'ningbo_housing';

UPDATE integration_platforms
SET name = '甬薪',
    remark = '甬薪。项目凭证和功能开关由项目平台配置维护。',
    updated_at = NOW()
WHERE code = 'yongxin_v2';
