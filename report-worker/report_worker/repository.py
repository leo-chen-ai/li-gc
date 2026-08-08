import json
import os
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


class Repository:
    def __init__(self):
        self.database_url = os.environ["DATABASE_URL"]
        self.credential_key = os.environ["REPORT_FORWARD_CREDENTIAL_KEY"]
        self.worker_target = os.environ.get("REPORT_FORWARD_WORKER_TARGET", "k3s")
        try:
            cooldown = int(os.environ.get("REPORT_FORWARD_PRODUCTION_COOLDOWN_SECONDS", "600"))
        except ValueError:
            cooldown = 600
        self.production_cooldown_seconds = max(cooldown, 0)

    @contextmanager
    def connection(self):
        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            yield conn

    def schedule_due(self):
        with self.connection() as conn, conn.transaction():
            configs = conn.execute(
                """
                SELECT id, name
                FROM report_forward_configs
                WHERE is_deleted=FALSE AND is_enabled=TRUE
                  AND lifecycle_status='production' AND next_run_at <= NOW()
                ORDER BY next_run_at
                LIMIT 20 FOR UPDATE SKIP LOCKED
                """
            ).fetchall()
            for config in configs:
                conn.execute(
                    """
                    INSERT INTO report_forward_runs
                        (config_id, config_name, trigger_type, run_mode, priority, scheduled_date)
                    VALUES (%s,%s,'scheduled','production',50,(NOW() AT TIME ZONE 'Asia/Shanghai')::date)
                    ON CONFLICT (config_id, scheduled_date)
                        WHERE trigger_type='scheduled' AND run_mode='production'
                    DO NOTHING
                    """,
                    (config["id"], config["name"]),
                )
                conn.execute(
                    """UPDATE report_forward_configs
                       SET next_run_at=report_forward_next_run(schedule_time, schedule_timezone), updated_at=NOW()
                       WHERE id=%s""",
                    (config["id"],),
                )

    def claim_run(self, worker_id):
        with self.connection() as conn, conn.transaction():
            # Serialize claims so the global single-browser cap cannot race even if
            # somebody accidentally scales the Deployment above one replica.
            conn.execute("SELECT pg_advisory_xact_lock(731047002)")
            return conn.execute(
                """
                WITH cooldown AS (
                    SELECT make_interval(secs => %s) AS duration
                ), candidate AS (
                    SELECT r.id
                    FROM report_forward_runs r
                    CROSS JOIN cooldown cd
                    WHERE (
                        r.status='pending'
                        OR (r.status IN ('running','cancelling') AND r.lease_expires_at < NOW())
                    )
                    AND NOT r.cancel_requested
                    AND COALESCE(r.options->>'worker_target', 'k3s') = %s
                    AND (
                        r.run_mode <> 'production'
                        OR (
                            NOT EXISTS (
                                SELECT 1
                                FROM report_forward_runs recent
                                WHERE recent.id <> r.id
                                  AND recent.run_mode = 'production'
                                  AND recent.completed_at > NOW() - cd.duration
                            )
                            AND NOT EXISTS (
                                SELECT 1
                                FROM report_forward_events retry_event
                                JOIN report_forward_runs retry_run ON retry_run.id = retry_event.run_id
                                WHERE retry_run.run_mode = 'production'
                                  AND retry_event.stage = 'retry_wait'
                                  AND retry_event.created_at > NOW() - cd.duration
                            )
                            AND (
                                r.current_stage <> 'retry_wait'
                                OR r.updated_at <= NOW() - cd.duration
                            )
                        )
                    )
                    AND (SELECT COUNT(*) FROM report_forward_runs live
                         WHERE live.status IN ('running','cancelling')
                           AND live.lease_expires_at > NOW()) < 1
                    AND NOT EXISTS (
                        SELECT 1 FROM report_forward_runs active
                        WHERE active.id<>r.id AND active.config_id=r.config_id
                          AND active.status IN ('running','cancelling')
                          AND active.lease_expires_at > NOW()
                    )
                    ORDER BY r.priority DESC, r.created_at, r.id
                    LIMIT 1 FOR UPDATE SKIP LOCKED
                )
                UPDATE report_forward_runs r
                SET status='running', current_stage='starting', claimed_by=%s,
                    lease_expires_at=NOW()+INTERVAL '2 minutes',
                    attempt_count=attempt_count+1,
                    started_at=COALESCE(started_at,NOW()), updated_at=NOW()
                FROM candidate WHERE r.id=candidate.id
                RETURNING r.*
                """,
                (self.production_cooldown_seconds, self.worker_target, worker_id),
            ).fetchone()

    def runtime_config(self, config_id):
        with self.connection() as conn:
            return conn.execute(
                """
                SELECT c.*,
                       pgp_sym_decrypt(c.source_password_cipher,%s) AS source_password,
                       pgp_sym_decrypt(c.target_password_cipher,%s) AS target_password,
                       CASE WHEN c.verification_config_cipher IS NULL THEN '{}'::jsonb
                            ELSE pgp_sym_decrypt(c.verification_config_cipher,%s)::jsonb END AS verification_config
                FROM report_forward_configs c WHERE c.id=%s AND c.is_deleted=FALSE
                """,
                (self.credential_key, self.credential_key, self.credential_key, config_id),
            ).fetchone()

    def heartbeat(self, worker_id, run_id=None, status="idle", version=None):
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO report_forward_worker_heartbeats
                    (worker_id,pod_name,status,current_run_id,worker_version,last_seen_at)
                VALUES (%s,%s,%s,%s,%s,NOW())
                ON CONFLICT(worker_id) DO UPDATE SET
                    pod_name=EXCLUDED.pod_name,status=EXCLUDED.status,
                    current_run_id=EXCLUDED.current_run_id,
                    worker_version=EXCLUDED.worker_version,last_seen_at=NOW()
                """,
                (worker_id, os.environ.get("HOSTNAME", worker_id), status, run_id, version),
            )
            if run_id:
                conn.execute(
                    """UPDATE report_forward_runs SET lease_expires_at=NOW()+INTERVAL '2 minutes',updated_at=NOW()
                       WHERE id=%s AND claimed_by=%s AND status IN ('running','cancelling')""",
                    (run_id, worker_id),
                )

    def event(self, run_id, stage, message, level="info", project_id=None, context=None):
        with self.connection() as conn:
            conn.execute(
                """INSERT INTO report_forward_events(run_id,run_project_id,stage,level,message,context)
                   VALUES (%s,%s,%s,%s,%s,%s)""",
                (run_id, project_id, stage, level, message, Jsonb(context or {})),
            )

    def set_stage(self, run_id, stage):
        with self.connection() as conn:
            conn.execute(
                "UPDATE report_forward_runs SET current_stage=%s,updated_at=NOW() WHERE id=%s",
                (stage, run_id),
            )

    def cancelled(self, run_id):
        with self.connection() as conn:
            row = conn.execute("SELECT cancel_requested FROM report_forward_runs WHERE id=%s", (run_id,)).fetchone()
            return not row or row["cancel_requested"]

    def upsert_project(self, run_id, project_name, status="discovered", stage="discovered"):
        with self.connection() as conn:
            return conn.execute(
                """
                INSERT INTO report_forward_run_projects(run_id,external_project_name,status,current_stage,started_at)
                VALUES (%s,%s,%s,%s,NOW())
                ON CONFLICT(run_id,external_project_name) DO UPDATE SET
                    status=EXCLUDED.status,current_stage=EXCLUDED.current_stage,updated_at=NOW()
                RETURNING id
                """,
                (run_id, project_name, status, stage),
            ).fetchone()["id"]

    def update_project(self, project_id, **fields):
        allowed = {
            "status", "current_stage", "source_row_count", "converted_row_count",
            "upload_total_count", "upload_success_count", "upload_failure_count",
            "target_receipt", "last_error",
        }
        values = {key: value for key, value in fields.items() if key in allowed}
        if not values:
            return
        assignments = []
        params = []
        for key, value in values.items():
            assignments.append(f"{key}=%s")
            params.append(Jsonb(value) if key == "target_receipt" else value)
        assignments.append("updated_at=NOW()")
        if values.get("status") in {"success", "failed", "validated", "partial_success"}:
            assignments.append("completed_at=NOW()")
        params.append(project_id)
        with self.connection() as conn:
            conn.execute(f"UPDATE report_forward_run_projects SET {','.join(assignments)} WHERE id=%s", params)

    def add_artifact(self, run_id, project_id, artifact_type, stored):
        with self.connection() as conn:
            return conn.execute(
                """INSERT INTO report_forward_artifacts
                   (run_id,run_project_id,artifact_type,object_key,original_filename,content_type,byte_size,sha256)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (run_id, project_id, artifact_type, stored["object_key"], stored["filename"],
                 stored["content_type"], stored["byte_size"], stored["sha256"]),
            ).fetchone()["id"]

    def converted_artifacts(self, source_run_id, config_id):
        return self.artifacts(source_run_id, config_id, "converted")

    def artifacts(self, source_run_id, config_id, artifact_type):
        with self.connection() as conn:
            return conn.execute(
                """SELECT a.*,p.external_project_name
                   FROM report_forward_artifacts a
                   JOIN report_forward_runs r ON r.id=a.run_id
                   LEFT JOIN report_forward_run_projects p ON p.id=a.run_project_id
                   WHERE a.run_id=%s AND r.config_id=%s AND a.artifact_type=%s
                   ORDER BY a.created_at""",
                (source_run_id, config_id, artifact_type),
            ).fetchall()

    def add_items(self, run_id, project_id, items):
        if not items:
            return
        with self.connection() as conn:
            with conn.cursor() as cur:
                for item in items:
                    cur.execute(
                        """
                        INSERT INTO report_forward_items
                            (run_id,run_project_id,source_row_no,person_name,gender,household_type,
                             identity_type,identity_cipher,identity_fingerprint,phone_cipher,address_cipher,status)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,
                                pgp_sym_encrypt(%s,%s,'cipher-algo=aes256'),%s,
                                CASE WHEN %s='' THEN NULL ELSE pgp_sym_encrypt(%s,%s,'cipher-algo=aes256') END,
                                CASE WHEN %s='' THEN NULL ELSE pgp_sym_encrypt(%s,%s,'cipher-algo=aes256') END,'converted')
                        ON CONFLICT(run_project_id,identity_fingerprint) DO NOTHING
                        """,
                        (run_id, project_id, item["row_no"], item["name"], item.get("gender"),
                         item.get("household_type"), item.get("identity_type"), item["identity"],
                         self.credential_key, item["fingerprint"], item.get("phone", ""), item.get("phone", ""),
                         self.credential_key, item.get("address", ""), item.get("address", ""), self.credential_key),
                    )

    def mark_project_items(self, project_id, status, target_result=None, error=None):
        with self.connection() as conn:
            conn.execute(
                """UPDATE report_forward_items SET status=%s,target_result=%s,last_error=%s,
                   pushed_at=CASE WHEN %s IN ('submitted','validated') THEN NOW() ELSE pushed_at END,updated_at=NOW()
                   WHERE run_project_id=%s""",
                (status, Jsonb(target_result or {}), error, status, project_id),
            )

    def mark_project_item_results(self, project_id, default_status, target_result, person_results):
        with self.connection() as conn, conn.transaction():
            matched_groups = []
            matched_ids = set()
            fingerprint_results = [
                item for item in person_results if item.get("identity_fingerprint")
            ]
            name_results = {}
            for item in person_results:
                if not item.get("identity_fingerprint") and item.get("person_name"):
                    name_results.setdefault(item["person_name"], []).append(item)

            for item in fingerprint_results:
                rows = conn.execute(
                    """SELECT id FROM report_forward_items
                       WHERE run_project_id=%s AND identity_fingerprint=%s""",
                    (project_id, item["identity_fingerprint"]),
                ).fetchall()
                if len(rows) != 1:
                    return self._mark_project_results_unknown(conn, project_id, target_result)
                ids = [rows[0]["id"]]
                if matched_ids.intersection(ids):
                    return self._mark_project_results_unknown(conn, project_id, target_result)
                matched_ids.update(ids)
                matched_groups.append((ids, item.get("error")))

            for person_name, items in name_results.items():
                rows = conn.execute(
                    """SELECT id FROM report_forward_items
                       WHERE run_project_id=%s AND person_name=%s""",
                    (project_id, person_name),
                ).fetchall()
                ids = [row["id"] for row in rows]
                if len(ids) != len(items) or matched_ids.intersection(ids):
                    return self._mark_project_results_unknown(conn, project_id, target_result)
                matched_ids.update(ids)
                matched_groups.append((ids, items[0].get("error")))

            if len(matched_ids) != len(person_results):
                return self._mark_project_results_unknown(conn, project_id, target_result)

            conn.execute(
                """UPDATE report_forward_items SET status=%s,target_result=%s,last_error=NULL,
                   pushed_at=CASE WHEN %s IN ('submitted','validated') THEN NOW() ELSE pushed_at END,
                   updated_at=NOW() WHERE run_project_id=%s""",
                (default_status, Jsonb(target_result or {}), default_status, project_id),
            )
            with conn.cursor() as cur:
                cur.executemany(
                    """UPDATE report_forward_items SET status='failed',target_result=%s,last_error=%s,
                       pushed_at=NULL,updated_at=NOW() WHERE run_project_id=%s AND id=ANY(%s)""",
                    [
                        (
                            Jsonb(target_result or {}),
                            error or "政府错误明细判定该人员失败",
                            project_id,
                            ids,
                        )
                        for ids, error in matched_groups
                    ],
                )
            return True

    def _mark_project_results_unknown(self, conn, project_id, target_result):
        conn.execute(
            """UPDATE report_forward_items SET status='result_unknown',target_result=%s,
               last_error='政府只返回批量汇总，无法可靠对应到个人结果',pushed_at=NULL,
               updated_at=NOW() WHERE run_project_id=%s""",
            (Jsonb(target_result or {}), project_id),
        )
        return False

    def complete(self, run_id, status, error=None):
        with self.connection() as conn:
            conn.execute(
                """
                UPDATE report_forward_runs r SET
                    status=%s,current_stage=%s,error_summary=%s,completed_at=NOW(),
                    lease_expires_at=NULL,updated_at=NOW(),
                    discovered_count=(SELECT COUNT(*) FROM report_forward_run_projects p WHERE p.run_id=r.id),
                    downloaded_count=(SELECT COUNT(*) FROM report_forward_artifacts a WHERE a.run_id=r.id AND a.artifact_type='source'),
                    converted_count=(SELECT COUNT(*) FROM report_forward_artifacts a WHERE a.run_id=r.id AND a.artifact_type='converted'),
                    item_count=(SELECT COUNT(*) FROM report_forward_items i WHERE i.run_id=r.id),
                    uploaded_count=(SELECT COALESCE(SUM(p.upload_total_count),0) FROM report_forward_run_projects p WHERE p.run_id=r.id),
                    success_count=(SELECT COALESCE(SUM(p.upload_success_count),0) FROM report_forward_run_projects p WHERE p.run_id=r.id),
                    failure_count=(SELECT COALESCE(SUM(p.upload_failure_count),0) FROM report_forward_run_projects p WHERE p.run_id=r.id)
                WHERE r.id=%s
                """,
                (status, status, error, run_id),
            )

    def schedule_retry(self, run_id, error, max_retries):
        with self.connection() as conn, conn.transaction():
            row = conn.execute(
                """SELECT attempt_count,cancel_requested FROM report_forward_runs
                   WHERE id=%s FOR UPDATE""",
                (run_id,),
            ).fetchone()
            if (
                not row
                or row["cancel_requested"]
                or row["attempt_count"] > max_retries
            ):
                return False
            retry_number = row["attempt_count"]
            conn.execute(
                """UPDATE report_forward_runs SET status='pending',current_stage='retry_wait',
                   error_summary=%s,claimed_by=NULL,lease_expires_at=NULL,completed_at=NULL,
                   updated_at=NOW() WHERE id=%s""",
                (error, run_id),
            )
            conn.execute(
                """INSERT INTO report_forward_events
                   (run_id,stage,level,message,context)
                   VALUES (%s,'retry_wait','warning',%s,%s)""",
                (
                    run_id,
                    f"执行异常，准备自动重试 {retry_number}/{max_retries}",
                    Jsonb({
                        "retry_number": retry_number,
                        "max_retries": max_retries,
                        "error": error,
                    }),
                ),
            )
            return True
