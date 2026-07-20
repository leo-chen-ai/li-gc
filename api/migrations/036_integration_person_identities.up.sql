CREATE TABLE integration_person_identities (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
    platform_id         UUID NOT NULL REFERENCES integration_platforms(id) ON DELETE CASCADE,

    identity_type       VARCHAR(40) NOT NULL DEFAULT 'id_card',
    identity_value      VARCHAR(200) NOT NULL,
    external_person_id  VARCHAR(200) NOT NULL,
    external_payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_verified_at    TIMESTAMPTZ,
    remark              TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_integration_person_identities_identity_active
    ON integration_person_identities(platform_id, identity_type, identity_value)
    WHERE is_deleted = FALSE;
CREATE UNIQUE INDEX idx_integration_person_identities_external_active
    ON integration_person_identities(platform_id, external_person_id)
    WHERE is_deleted = FALSE;
CREATE INDEX idx_integration_person_identities_verified
    ON integration_person_identities(platform_id, last_verified_at);

CREATE TRIGGER update_integration_person_identities_updated_at
    BEFORE UPDATE ON integration_person_identities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

INSERT INTO integration_person_identities (
    platform_id,
    identity_type,
    identity_value,
    external_person_id,
    external_payload,
    last_verified_at
)
SELECT DISTINCT ON (binding.platform_id, UPPER(BTRIM(worker.id_card)))
    binding.platform_id,
    'id_card',
    UPPER(BTRIM(worker.id_card)),
    mapping.external_payload ->> 'worker_code',
    mapping.external_payload,
    mapping.last_pushed_at
FROM integration_entity_mappings mapping
JOIN integration_project_bindings binding
  ON binding.id = mapping.binding_id
 AND binding.is_deleted = FALSE
JOIN construction_workers worker
  ON worker.id = mapping.local_entity_id
WHERE mapping.is_deleted = FALSE
  AND mapping.entity_type IN ('worker', 'construction_worker')
  AND NULLIF(BTRIM(worker.id_card), '') IS NOT NULL
  AND NULLIF(BTRIM(mapping.external_payload ->> 'worker_code'), '') IS NOT NULL
ORDER BY binding.platform_id, UPPER(BTRIM(worker.id_card)), mapping.last_pushed_at DESC NULLS LAST
ON CONFLICT DO NOTHING;
