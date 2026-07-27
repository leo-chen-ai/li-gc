INSERT INTO integration_platforms (
    code,
    name,
    adapter,
    base_url,
    auth_type,
    config,
    remark
)
VALUES (
    'ningbo_housing',
    '宁波市住建',
    'ningbo_housing',
    'http://183.136.157.18:7334',
    'appkey_curtime_sha256',
    '{
        "endpoints": {
            "add_team": {"method": "POST", "path": "/Project/AddTeam", "body": "json"},
            "list_teams": {"method": "GET", "path": "/Project/ListTeams", "body": "query"}
        }
    }'::jsonb,
    '宁波市住建实名制平台第三方数据直连接口'
)
ON CONFLICT DO NOTHING;
