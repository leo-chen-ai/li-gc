-- Do not create platform work when an UPDATE only touched updated_at or wrote
-- the same business values back to a construction record.
CREATE OR REPLACE FUNCTION emit_construction_integration_event()
RETURNS TRIGGER AS $$
DECLARE
    source_row JSONB;
    event_project_id UUID;
    event_aggregate_id UUID;
    event_aggregate_type TEXT;
    event_type TEXT;
    event_payload JSONB;
BEGIN
    IF TG_OP = 'UPDATE'
       AND (to_jsonb(OLD) - 'updated_at') IS NOT DISTINCT FROM
           (to_jsonb(NEW) - 'updated_at') THEN
        RETURN NEW;
    END IF;

    source_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    event_project_id := (source_row ->> 'project_id')::uuid;
    event_aggregate_id := (source_row ->> 'id')::uuid;

    -- A project-level delete cascades into its units, teams and workers after
    -- the parent row is already gone. Those child events cannot reference the
    -- deleted project and there is no platform target left to synchronize.
    IF NOT EXISTS (
        SELECT 1 FROM construction_projects project WHERE project.id = event_project_id
    ) THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    event_aggregate_type := CASE TG_TABLE_NAME
        WHEN 'construction_units' THEN 'unit'
        WHEN 'construction_teams' THEN 'team'
        WHEN 'construction_workers' THEN 'worker'
        ELSE TG_TABLE_NAME
    END;
    event_type := 'construction.' || event_aggregate_type || '.changed';
    event_payload := jsonb_build_object(
        'operation', lower(TG_OP),
        'source_table', TG_TABLE_NAME,
        'occurred_at', clock_timestamp()
    );

    IF TG_TABLE_NAME = 'construction_workers' AND TG_OP = 'UPDATE' THEN
        event_payload := event_payload || jsonb_build_object(
            'entry_exit_changed',
            OLD.work_status IS DISTINCT FROM NEW.work_status
            OR OLD.team_id IS DISTINCT FROM NEW.team_id
            OR OLD.entry_time IS DISTINCT FROM NEW.entry_time
            OR OLD.exit_time IS DISTINCT FROM NEW.exit_time
        );
    END IF;

    IF TG_OP = 'DELETE' THEN
        event_payload := event_payload || jsonb_build_object('deleted_snapshot', source_row);
    END IF;

    INSERT INTO integration_outbox_events (
        project_id, event_type, aggregate_type, aggregate_id, payload, status
    )
    VALUES (
        event_project_id, event_type, event_aggregate_type,
        event_aggregate_id, event_payload, 'pending'
    );

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
