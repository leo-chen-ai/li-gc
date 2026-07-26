import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

function json(value) {
  return JSON.stringify(value ?? null);
}

export class MockDatabase {
  constructor(filename) {
    if (filename !== ":memory:") {
      mkdirSync(dirname(filename), { recursive: true });
    }
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    this.migrate();
    this.seed();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sequences (
        name TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        operation TEXT NOT NULL,
        http_method TEXT NOT NULL,
        path TEXT NOT NULL,
        headers_json TEXT NOT NULL,
        query_json TEXT NOT NULL,
        body_json TEXT NOT NULL,
        auth_valid INTEGER,
        response_status INTEGER,
        response_body_json TEXT,
        received_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_requests_platform_operation
        ON requests(platform, operation, id DESC);
      CREATE TABLE IF NOT EXISTS ningbo_workers (
        identity_card TEXT PRIMARY KEY,
        worker_code TEXT NOT NULL UNIQUE,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS ningbo_teams (
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL,
        corp_code TEXT,
        team_type TEXT,
        leader_name TEXT,
        team_name TEXT,
        entry_time TEXT,
        exit_time TEXT,
        is_exited INTEGER NOT NULL DEFAULT 0,
        data_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ningbo_project_workers (
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL,
        team_id INTEGER NOT NULL,
        worker_code TEXT NOT NULL,
        is_exited INTEGER NOT NULL DEFAULT 0,
        data_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS yongxin_teams (
        team_sys_no TEXT PRIMARY KEY,
        project_code TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS async_jobs (
        token TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        operation TEXT NOT NULL,
        state TEXT NOT NULL,
        message TEXT NOT NULL,
        request_data_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id INTEGER PRIMARY KEY,
        platform TEXT NOT NULL,
        file_name TEXT,
        content_type TEXT,
        byte_size INTEGER NOT NULL,
        public_path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS auth_nonces (
        platform TEXT NOT NULL,
        principal TEXT NOT NULL,
        nonce TEXT NOT NULL,
        expires_at_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (platform, principal, nonce)
      );
      CREATE TABLE IF NOT EXISTS faults (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        operation TEXT NOT NULL,
        remaining INTEGER NOT NULL,
        status INTEGER NOT NULL,
        delay_ms INTEGER NOT NULL DEFAULT 0,
        body_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  seed() {
    for (const name of ["ningbo_team", "ningbo_worker", "ningbo_project_worker", "file", "job"]) {
      this.db.prepare("INSERT OR IGNORE INTO sequences(name, value) VALUES (?, 1000)").run(name);
    }
  }

  next(name) {
    this.db.prepare("UPDATE sequences SET value = value + 1 WHERE name = ?").run(name);
    return Number(this.db.prepare("SELECT value FROM sequences WHERE name = ?").get(name).value);
  }

  recordRequest({ platform, operation, method, path, headers, query, body, authValid }) {
    const result = this.db.prepare(`
      INSERT INTO requests(platform, operation, http_method, path, headers_json, query_json, body_json, auth_valid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(platform, operation, method, path, json(headers), json(query), json(body), authValid == null ? null : Number(authValid));
    return Number(result.lastInsertRowid);
  }

  finishRequest(id, status, body) {
    this.db.prepare("UPDATE requests SET response_status = ?, response_body_json = ? WHERE id = ?")
      .run(status, json(body), id);
  }

  upsertNingboWorker(identityCard, workerCode, data) {
    this.db.prepare(`
      INSERT INTO ningbo_workers(identity_card, worker_code, data_json)
      VALUES (?, ?, ?)
      ON CONFLICT(identity_card) DO UPDATE SET
        worker_code = excluded.worker_code,
        data_json = excluded.data_json,
        updated_at = datetime('now')
    `).run(identityCard, workerCode, json(data));
  }

  findNingboWorker(identityCard) {
    return this.db.prepare("SELECT * FROM ningbo_workers WHERE identity_card = ?").get(identityCard);
  }

  addNingboTeam(data) {
    const id = this.next("ningbo_team");
    this.db.prepare(`
      INSERT INTO ningbo_teams(id, project_id, corp_code, team_type, leader_name, team_name, entry_time, data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.ProjectApartmentId, data.CorpCode ?? "", data.ProjectTeamTypeName ?? "",
      data.TeamLeaderName ?? "", data.TeamName ?? `${data.TeamLeaderName ?? "模拟"}${data.ProjectTeamTypeName ?? "班组"}`,
      data.EntryTime ?? null, json(data));
    return id;
  }

  exitNingboTeam(id, exitTime) {
    return this.db.prepare("UPDATE ningbo_teams SET is_exited = 1, exit_time = ? WHERE id = ?").run(exitTime, id).changes;
  }

  listNingboTeams({ projectId, teamName, page, pageSize }) {
    const where = ["project_id = ?"];
    const params = [projectId];
    if (teamName) {
      where.push("team_name LIKE ?");
      params.push(`%${teamName}%`);
    }
    const clause = where.join(" AND ");
    const total = Number(this.db.prepare(`SELECT COUNT(*) AS count FROM ningbo_teams WHERE ${clause}`).get(...params).count);
    const rows = this.db.prepare(`SELECT * FROM ningbo_teams WHERE ${clause} ORDER BY id LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize);
    return { total, rows };
  }

  addNingboProjectWorker(data) {
    const id = this.next("ningbo_project_worker");
    this.db.prepare(`
      INSERT INTO ningbo_project_workers(id, project_id, team_id, worker_code, data_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, data.ProjectApartmentId, data.TeamId, data.WorkerCode, json(data));
    return id;
  }

  updateNingboProjectWorker(data) {
    return this.db.prepare("UPDATE ningbo_project_workers SET data_json = ? WHERE id = ?")
      .run(json(data), data.ProjectWorkerId).changes;
  }

  exitNingboProjectWorker(id) {
    return this.db.prepare("UPDATE ningbo_project_workers SET is_exited = 1 WHERE id = ?").run(id).changes;
  }

  addYongxinTeam(projectCode, data) {
    const no = `MOCK-TEAM-${this.next("ningbo_team")}`;
    this.db.prepare("INSERT INTO yongxin_teams(team_sys_no, project_code, data_json) VALUES (?, ?, ?)")
      .run(no, projectCode, json(data));
    return no;
  }

  createJob(platform, operation, requestData, result, state = "2", message = "mock completed") {
    const token = `${platform}-${operation.replaceAll(/[^a-zA-Z0-9]+/g, "_")}-${this.next("job")}`;
    this.db.prepare(`
      INSERT INTO async_jobs(token, platform, operation, state, message, request_data_json, result_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(token, platform, operation, state, message, json(requestData), json(result));
    return token;
  }

  getJob(token) {
    return this.db.prepare("SELECT * FROM async_jobs WHERE token = ?").get(token);
  }

  addFile(platform, fileName, contentType, byteSize, extension = "bin") {
    const id = this.next("file");
    const safeExtension = String(extension || "bin").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
    const publicPath = `/mock-files/${platform}/${id}.${safeExtension}`;
    this.db.prepare(`
      INSERT INTO uploaded_files(id, platform, file_name, content_type, byte_size, public_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, platform, fileName ?? null, contentType ?? null, byteSize, publicPath);
    return publicPath;
  }

  consumeNonce(platform, principal, nonce, expiresAtMs) {
    this.db.prepare("DELETE FROM auth_nonces WHERE expires_at_ms < ?").run(Date.now());
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO auth_nonces(platform, principal, nonce, expires_at_ms)
      VALUES (?, ?, ?, ?)
    `).run(platform, principal, nonce, expiresAtMs);
    return result.changes === 1;
  }

  addFault({ platform, operation, remaining, status, delayMs, body }) {
    const result = this.db.prepare(`
      INSERT INTO faults(platform, operation, remaining, status, delay_ms, body_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(platform, operation, remaining, status, delayMs, json(body));
    return Number(result.lastInsertRowid);
  }

  consumeFault(platform, operation) {
    const row = this.db.prepare(`
      SELECT * FROM faults
      WHERE platform = ? AND operation = ? AND remaining > 0
      ORDER BY id LIMIT 1
    `).get(platform, operation);
    if (!row) return null;
    this.db.prepare("UPDATE faults SET remaining = remaining - 1 WHERE id = ?").run(row.id);
    return { ...row, body: JSON.parse(row.body_json) };
  }

  listRequests({ platform, operation, limit = 100 }) {
    const where = [];
    const params = [];
    if (platform) { where.push("platform = ?"); params.push(platform); }
    if (operation) { where.push("operation = ?"); params.push(operation); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM requests ${clause} ORDER BY id DESC LIMIT ?`)
      .all(...params, Math.max(1, Math.min(Number(limit) || 100, 500)))
      .map((row) => ({
        id: row.id,
        platform: row.platform,
        operation: row.operation,
        method: row.http_method,
        path: row.path,
        headers: JSON.parse(row.headers_json),
        query: JSON.parse(row.query_json),
        body: JSON.parse(row.body_json),
        authValid: row.auth_valid == null ? null : Boolean(row.auth_valid),
        responseStatus: row.response_status,
        responseBody: row.response_body_json ? JSON.parse(row.response_body_json) : null,
        receivedAt: row.received_at
      }));
  }

  listFaults() {
    return this.db.prepare("SELECT * FROM faults ORDER BY id DESC").all().map((row) => ({
      id: row.id,
      platform: row.platform,
      operation: row.operation,
      remaining: row.remaining,
      status: row.status,
      delayMs: row.delay_ms,
      body: JSON.parse(row.body_json),
      createdAt: row.created_at
    }));
  }

  reset() {
    this.db.exec(`
      DELETE FROM requests;
      DELETE FROM ningbo_workers;
      DELETE FROM ningbo_teams;
      DELETE FROM ningbo_project_workers;
      DELETE FROM yongxin_teams;
      DELETE FROM async_jobs;
      DELETE FROM uploaded_files;
      DELETE FROM auth_nonces;
      DELETE FROM faults;
      UPDATE sequences SET value = 1000;
    `);
  }

  close() {
    this.db.close();
  }
}
