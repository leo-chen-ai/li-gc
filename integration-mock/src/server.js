import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { MockDatabase } from "./database.js";
import {
  NINGBO_ROUTES,
  XINLEDA_METHODS,
  YONGXIN_ROUTES,
  routeCatalog
} from "./catalog.js";

const DEFAULT_MAX_BODY_BYTES = 12 * 1024 * 1024;

function envConfig(overrides = {}) {
  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 3000),
    databasePath: process.env.MOCK_DATABASE_PATH ?? "./data/integration-mock.sqlite",
    authMode: (process.env.MOCK_AUTH_MODE ?? "permissive").toLowerCase(),
    adminToken: process.env.MOCK_ADMIN_TOKEN ?? "local-admin-token",
    maxBodyBytes: Number(process.env.MOCK_MAX_BODY_BYTES ?? DEFAULT_MAX_BODY_BYTES),
    ningboAppKey: process.env.MOCK_NINGBO_APP_KEY ?? "mock-ningbo-app-key",
    ningboAppSecret: process.env.MOCK_NINGBO_APP_SECRET ?? "mock-ningbo-secret",
    ningboProjectId: Number(process.env.MOCK_NINGBO_PROJECT_ID ?? 1206),
    ningboProjectGuid: process.env.MOCK_NINGBO_PROJECT_GUID ?? "00000000-0000-0000-0000-000000001206",
    ningboProjectName: process.env.MOCK_NINGBO_PROJECT_NAME ?? "山淮模拟测试项目",
    xinledaAppId: process.env.MOCK_XINLEDA_APP_ID ?? "mock-xinleda-app",
    xinledaAppSecret: process.env.MOCK_XINLEDA_APP_SECRET ?? "1234567890abcdef",
    xinledaTimestampWindowMs: Number(process.env.MOCK_XINLEDA_TIMESTAMP_WINDOW_MS ?? 10 * 60 * 1000),
    yongxinAppKey: process.env.MOCK_YONGXIN_APP_KEY ?? "mock-yongxin-app",
    yongxinAppSecret: process.env.MOCK_YONGXIN_APP_SECRET ?? "1234567890abcdef",
    yongxinProjectCode: process.env.MOCK_YONGXIN_PROJECT_CODE ?? "MOCK-PROJECT-001",
    ...overrides
  };
}

function json(res, status, body, extraHeaders = {}) {
  const encoded = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": encoded.length,
    "cache-control": "no-store",
    ...extraHeaders
  });
  res.end(encoded);
}

function delay(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, Math.min(ms, 30_000))) : Promise.resolve();
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error(`request body exceeds ${limit} bytes`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
  if (!raw.length) return { raw, value: null };
  if (contentType.includes("application/json")) {
    try {
      return { raw, value: JSON.parse(raw.toString("utf8")) };
    } catch {
      const error = new Error("invalid JSON request body");
      error.statusCode = 400;
      throw error;
    }
  }
  return { raw, value: { contentType, byteSize: raw.length } };
}

function requestHeaders(req) {
  return Object.fromEntries(
    Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value ?? ""])
  );
}

function queryObject(url) {
  const result = {};
  for (const [key, value] of url.searchParams) {
    if (Object.hasOwn(result, key)) {
      result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
    } else {
      result[key] = value;
    }
  }
  return result;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function md5(value) {
  return createHash("md5").update(value).digest("hex");
}

function safeEqual(actual, expected) {
  const left = Buffer.from(String(actual ?? ""));
  const right = Buffer.from(String(expected ?? ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

function detectRoute(method, path) {
  const ningbo = NINGBO_ROUTES.find(([routeMethod, routePath]) => routeMethod === method && routePath === path);
  if (ningbo) return { platform: "ningbo", operation: ningbo[2] };
  const yongxin = YONGXIN_ROUTES.find(([routeMethod, routePath]) => routeMethod === method && routePath === path);
  if (yongxin) return { platform: "yongxin", operation: yongxin[2] };
  if (method === "POST" && path === "/openapi") return { platform: "xinleda", operation: "openapi" };
  if (method === "POST" && path === "/upfiles") return { platform: "xinleda", operation: "upfiles" };
  return null;
}

function ningboAuth(headers, config) {
  const appKey = headers.appkey ?? "";
  const curTime = headers.curtime ?? "";
  const checksum = headers.checksum ?? "";
  if (!appKey || !curTime || !checksum) {
    return { valid: false, status: 401, body: { Message: "缺少 AppKey、CurTime 或 Checksum" } };
  }
  if (!safeEqual(appKey, config.ningboAppKey)) {
    return { valid: false, status: 401, body: { Message: "AppKey 无效" } };
  }
  const nowSince2000 = Math.floor(Date.now() / 1000) - 946_684_800;
  if (!/^\d+$/.test(curTime) || Math.abs(nowSince2000 - Number(curTime)) > 2 * 60 * 60) {
    return { valid: false, status: 401, body: { Message: "CurTime 无效或已超过 2 小时有效期" } };
  }
  if (!safeEqual(checksum.toLowerCase(), sha256(`${config.ningboAppSecret}${curTime}`))) {
    return { valid: false, status: 401, body: { Message: "Checksum 校验失败" } };
  }
  return { valid: true };
}

function xinledaSignature(body, secret) {
  const source = Object.keys(body ?? {})
    .filter((key) => key !== "sign")
    .sort()
    .map((key) => `${key}=${body[key] ?? ""}`)
    .join("&") + `&appsecret=${secret}`;
  return sha256(source.toLowerCase());
}

function xinledaError(code, message) {
  return { valid: false, status: 200, body: { code, message, data: null } };
}

function xinledaAuth(body, config, db) {
  if (!body || typeof body !== "object") return xinledaError(-1, "请求参数错误");
  for (const key of ["method", "version", "appid", "format", "timestamp", "nonce", "sign", "data"]) {
    if (body[key] == null || String(body[key]).length === 0) return xinledaError(-1, `请求参数错误：缺少 ${key}`);
  }
  if (!safeEqual(body.appid, config.xinledaAppId)) return xinledaError(-3, "无 API 访问权限");
  if (String(body.version) !== "1.0") return xinledaError(5, "版本号有误");
  if (String(body.format).toLowerCase() !== "json") return xinledaError(-1, "请求参数错误：format 必须为 json");
  const timestamp = Number(body.timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > config.xinledaTimestampWindowMs) {
    return xinledaError(-1, "timestamp 无效或已过期");
  }
  if (!safeEqual(String(body.sign).toLowerCase(), xinledaSignature(body, config.xinledaAppSecret))) {
    return xinledaError(-2, "签名校验错误");
  }
  if (!db.consumeNonce("xinleda", config.xinledaAppId, String(body.nonce), timestamp + config.xinledaTimestampWindowMs)) {
    return xinledaError(4, "nonce 校验重复");
  }
  return { valid: true };
}

function xinledaUploadAuth(query, config) {
  const timestamp = String(query.timestamp ?? "");
  const source = `appid=${query.appid ?? ""}&timestamp=${timestamp}&appsecret=${config.xinledaAppSecret}`;
  if (!query.appid || !timestamp || !query.sign) return xinledaError(-1, "请求参数错误：缺少 appid、timestamp 或 sign");
  if (!safeEqual(query.appid, config.xinledaAppId)) return xinledaError(-3, "无 API 访问权限");
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > config.xinledaTimestampWindowMs) {
    return xinledaError(-1, "timestamp 无效或已过期");
  }
  if (!safeEqual(String(query.sign).toLowerCase(), sha256(source.toLowerCase()))) {
    return xinledaError(-2, "签名校验错误");
  }
  return { valid: true };
}

function yongxinAuth(headers, body, operation, config) {
  if (operation === "sysFile/v1/uploadImg") {
    if (!body?.appKey) return { valid: false, status: 200, body: { code: 2007, msg: "缺少 appKey", data: null } };
    if (!safeEqual(body.appKey, config.yongxinAppKey)) return { valid: false, status: 200, body: { code: 2002, msg: "key不存在", data: null } };
    return { valid: true };
  }
  const timestamp = String(headers.timestamp ?? "");
  if (!headers.projectcode || !headers.appkey || !timestamp || !headers.sign) {
    return { valid: false, status: 200, body: { code: 2007, msg: "无权限，请验证header参数", data: null } };
  }
  if (!safeEqual(headers.appkey, config.yongxinAppKey)) {
    return { valid: false, status: 200, body: { code: 2002, msg: "key不存在", data: null } };
  }
  if (!safeEqual(headers.projectcode, config.yongxinProjectCode)) {
    return { valid: false, status: 200, body: { code: 2006, msg: "项目码无效", data: null } };
  }
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 10 * 60 * 1000) {
    return { valid: false, status: 200, body: { code: 2004, msg: "请求过期", data: null } };
  }
  if (!safeEqual(String(headers.sign).toLowerCase(), md5(`${config.yongxinAppKey}&${config.yongxinAppSecret}&${timestamp}`))) {
    return { valid: false, status: 200, body: { code: 2005, msg: "签名无效", data: null } };
  }
  return { valid: true };
}

function parseXinledaData(data) {
  if (typeof data !== "string") return data ?? null;
  try { return JSON.parse(data); } catch { return data; }
}

function normalizeXinledaMethod(method) {
  return String(method ?? "").replace(/^company\.\s+safeguard$/, "company.safeguard").trim();
}

function publicConfig(config) {
  return {
    authMode: config.authMode,
    databasePath: config.databasePath,
    credentials: {
      ningbo: {
        appKey: config.ningboAppKey,
        appSecret: config.ningboAppSecret,
        projectId: config.ningboProjectId,
        projectGuid: config.ningboProjectGuid
      },
      xinleda: { appId: config.xinledaAppId, appSecret: config.xinledaAppSecret },
      yongxin: {
        appKey: config.yongxinAppKey,
        appSecret: config.yongxinAppSecret,
        projectCode: config.yongxinProjectCode
      }
    }
  };
}

function requireAdmin(req, res, config) {
  const bearer = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const headerToken = String(req.headers["x-mock-admin-token"] ?? "");
  if (safeEqual(bearer || headerToken, config.adminToken)) return true;
  json(res, 401, { error: "mock admin token required" });
  return false;
}

async function handleAdmin(req, res, url, body, db, config) {
  if (!requireAdmin(req, res, config)) return;
  if (req.method === "GET" && url.pathname === "/__mock") {
    return json(res, 200, { service: "shanhuai-integration-mock", ...publicConfig(config), catalog: routeCatalog() });
  }
  if (req.method === "GET" && url.pathname === "/__mock/routes") {
    return json(res, 200, routeCatalog());
  }
  if (req.method === "GET" && url.pathname === "/__mock/requests") {
    return json(res, 200, {
      data: db.listRequests({
        platform: url.searchParams.get("platform"),
        operation: url.searchParams.get("operation"),
        limit: url.searchParams.get("limit")
      })
    });
  }
  if (req.method === "GET" && url.pathname === "/__mock/faults") {
    return json(res, 200, { data: db.listFaults() });
  }
  if (req.method === "POST" && url.pathname === "/__mock/faults") {
    const platform = String(body?.platform ?? "");
    const operation = String(body?.operation ?? "");
    if (!platform || !operation) return json(res, 400, { error: "platform and operation are required" });
    const id = db.addFault({
      platform,
      operation,
      remaining: Math.max(1, Number(body.remaining ?? 1)),
      status: Math.max(100, Math.min(599, Number(body.status ?? 503))),
      delayMs: Math.max(0, Number(body.delayMs ?? 0)),
      body: body.body ?? { code: 503, message: "mock injected failure" }
    });
    return json(res, 201, { id });
  }
  if (req.method === "POST" && url.pathname === "/__mock/reset") {
    db.reset();
    return json(res, 200, { success: true });
  }
  json(res, 404, { error: "unknown mock admin endpoint" });
}

function ningboTeamResponse(row) {
  return {
    Id: row.id,
    EnterpriseName: JSON.parse(row.data_json).EnterpriseName ?? "模拟参建单位",
    CorpCode: row.corp_code,
    ProjectTeamTypeName: row.team_type,
    TeamLeaderName: row.leader_name,
    TeamName: row.team_name,
    EntryTime: row.entry_time,
    ExitTime: row.exit_time,
    IsExited: Boolean(row.is_exited)
  };
}

function handleNingbo(operation, body, query, db, config) {
  switch (operation) {
    case "Attendance/Add":
    case "EnterpriseWorker/AddEnterpriseOfWorker":
    case "EnterpriseWorker/AddContract":
      return {};
    case "EnterpriseWorker/GetWorkerCode": {
      const worker = db.findNingboWorker(String(query.IdentityCard ?? ""));
      return worker ? { WorkerCode: worker.worker_code } : { WorkerCode: null };
    }
    case "EnterpriseWorker/AddOrUpdateWorker": {
      const identityCard = String(body?.IdentityCard ?? `MOCK-ID-${db.next("ningbo_worker")}`);
      const existing = db.findNingboWorker(identityCard);
      const workerCode = existing?.worker_code ?? `MOCK-WORKER-${sha256(identityCard).slice(0, 16).toUpperCase()}`;
      db.upsertNingboWorker(identityCard, workerCode, body ?? {});
      return { WorkerCode: workerCode };
    }
    case "Project/GetByFgwCode":
      return [{ ProjectApartmentId: config.ningboProjectId, ProjectApartmentName: config.ningboProjectName }];
    case "Project/AddTeam":
      return { TeamId: db.addNingboTeam({ ProjectApartmentId: config.ningboProjectId, ...(body ?? {}) }) };
    case "Project/TeamExit":
      db.exitNingboTeam(Number(body?.TeamId), body?.ExitTime ?? null);
      return {};
    case "Project/ListTeams": {
      const page = Math.max(1, Number(query.Page ?? 1));
      const pageSize = Math.max(1, Math.min(Number(query.PageSize ?? 20), 500));
      const result = db.listNingboTeams({
        projectId: Number(query.ProjectApartmentId ?? config.ningboProjectId),
        teamName: String(query.TeamName ?? ""),
        page,
        pageSize
      });
      return { TotalCount: result.total, Page: page, PageSize: pageSize, List: result.rows.map(ningboTeamResponse) };
    }
    case "Project/AddWorkerV2":
      return { ProjectWorkerId: db.addNingboProjectWorker({ ProjectApartmentId: config.ningboProjectId, ...(body ?? {}) }) };
    case "Project/EditWorker":
      db.updateNingboProjectWorker(body ?? {});
      return {};
    case "Project/ProjectWorkerExit":
      db.exitNingboProjectWorker(Number(body?.ProjectWorkerId));
      return {};
    default:
      return { Message: `unsupported Ningbo operation: ${operation}` };
  }
}

function xinledaJobResult(method, data, db) {
  if (method === "project.import") {
    return (Array.isArray(data) ? data : [data ?? {}]).map((item) => ({
      project_name: item.project_name ?? "模拟项目",
      project_code: item.project_code ?? `MOCK-XLD-PROJECT-${db.next("job")}`
    }));
  }
  return Array.isArray(data) ? data : [data];
}

function handleXinleda(body, db) {
  const method = normalizeXinledaMethod(body?.method);
  if (!XINLEDA_METHODS.includes(method)) {
    return { code: 1, message: "未找到此方法", data: null };
  }
  const data = parseXinledaData(body?.data);
  if (method === "unifiedlog.get") {
    const token = String(data ?? "");
    const job = db.getJob(token);
    if (!job) return { code: 2, message: "data错误：任务不存在", data: null };
    return {
      code: 0,
      message: "查询成功",
      data: {
        data: job.result_json,
        status: Number(job.state),
        method: job.operation,
        version: "1.0",
        reason: job.message === "mock completed" ? "" : job.message
      }
    };
  }
  const result = xinledaJobResult(method, data, db);
  const token = db.createJob("xinleda", method, data, result, "3", "mock completed");
  if (method === "project.import") {
    return { code: 0, message: "调用成功", data: JSON.stringify(result), token };
  }
  return { code: 20, message: "任务待执行", data: token };
}

function yongxinEnvelope(data = null, msg = "ok") {
  return { code: 0, msg, data };
}

function handleYongxin(operation, body, headers, rawBody, db, config) {
  const projectCode = String(headers.projectcode ?? config.yongxinProjectCode);
  switch (operation) {
    case "project/v1/query":
      return yongxinEnvelope({
        projectCode,
        projectName: config.ningboProjectName,
        addressCode: "330200",
        startDate: "2026-01-01",
        finishDate: "2028-12-31",
        investCharacter: 1,
        status: "03",
        type: 1,
        industry: 1,
        investTotal: 10000,
        bulidCharacter: "001",
        bulidScale: "02",
        acreage: 10000,
        length: 0,
        projectPurposes: "300",
        workPermit: "MOCK-PERMIT-001",
        progressType: 1,
        manager: "模拟项目经理",
        managerPhone: "13800000000",
        contractorCreditCode: "91330200MOCK000001",
        contractor: "山淮模拟总承包单位",
        hasPayment: true,
        hasRealName: true,
        hasDeposit: true,
        hasSubAccount: true,
        hasBankUndertakes: true,
        hasRightMonth: true
      });
    case "projectCorp/v2/add":
      return yongxinEnvelope(null);
    case "team/v2/add":
      return yongxinEnvelope({ teamSysNo: db.addYongxinTeam(projectCode, body ?? {}) });
    case "worker/v2/add":
    case "entryExit/v2/add":
    case "attend/v2/add": {
      const token = db.createJob("yongxin", operation, body, { accepted: true }, "2", "mock completed");
      return yongxinEnvelope({ requestSerialCode: token }, "mock queued");
    }
    case "asyncHandleResult/v1/query": {
      const token = String(body?.requestSerialCode ?? "");
      const job = db.getJob(token);
      if (!job) return { code: 2011, msg: "数据不存在", data: null };
      return yongxinEnvelope({ requestSerialCode: token, state: job.state, message: job.message });
    }
    case "sysFile/v1/uploadImg": {
      const extension = String(body?.fileType ?? "jpg");
      const estimatedSize = typeof body?.fileBase === "string" ? Math.floor(body.fileBase.length * 0.75) : rawBody.length;
      return yongxinEnvelope(db.addFile("yongxin", null, `image/${extension}`, estimatedSize, extension));
    }
    default:
      return { code: 2008, msg: `unsupported Yongxin operation: ${operation}`, data: null };
  }
}

function xinledaUpload(bodyValue, rawBody, headers, db) {
  const contentType = String(headers["content-type"] ?? "");
  const filename = rawBody.toString("latin1").match(/filename="([^"]+)"/i)?.[1] ?? "upload.bin";
  const extension = filename.includes(".") ? filename.split(".").pop() : "bin";
  const path = db.addFile("xinleda", filename, contentType, rawBody.length, extension);
  return { code: 0, message: "上传成功", data: path };
}

export function createMockServer(overrides = {}) {
  const config = envConfig(overrides);
  const db = overrides.database ?? new MockDatabase(config.databasePath);
  const ownsDatabase = !overrides.database;

  const server = createServer(async (req, res) => {
    const started = Date.now();
    let requestId = null;
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
      if (req.method === "GET" && path === "/health") {
        return json(res, 200, { status: "ok", service: "shanhuai-integration-mock", uptimeSeconds: Math.floor(process.uptime()) });
      }

      const needsBody = req.method !== "GET" && req.method !== "HEAD";
      const parsed = needsBody ? await readBody(req, config.maxBodyBytes) : { raw: Buffer.alloc(0), value: null };
      if (path.startsWith("/__mock")) {
        return await handleAdmin(req, res, new URL(path + url.search, url), parsed.value, db, config);
      }

      const route = detectRoute(req.method ?? "GET", path);
      if (!route) return json(res, 404, { error: "unknown documented interface", method: req.method, path });
      const headers = requestHeaders(req);
      const query = queryObject(url);
      let operation = route.operation;
      if (route.platform === "xinleda" && operation === "openapi") {
        operation = normalizeXinledaMethod(parsed.value?.method) || "openapi";
      }

      const auth = route.platform === "ningbo"
        ? ningboAuth(headers, config)
        : route.platform === "xinleda"
          ? (operation === "upfiles"
              ? xinledaUploadAuth(query, config)
              : xinledaAuth(parsed.value, config, db))
          : yongxinAuth(headers, parsed.value, operation, config);

      const recordBody = operation === "upfiles"
        ? { ...parsed.value, fileName: parsed.raw.toString("latin1").match(/filename="([^"]+)"/i)?.[1] ?? null }
        : parsed.value;
      requestId = db.recordRequest({
        platform: route.platform,
        operation,
        method: req.method,
        path,
        headers,
        query,
        body: recordBody,
        authValid: auth.valid
      });

      if (config.authMode === "strict" && !auth.valid) {
        db.finishRequest(requestId, auth.status, auth.body);
        return json(res, auth.status, auth.body);
      }

      const fault = db.consumeFault(route.platform, operation);
      if (fault) {
        await delay(fault.delay_ms);
        db.finishRequest(requestId, fault.status, fault.body);
        return json(res, fault.status, fault.body, { "x-mock-fault-id": String(fault.id) });
      }

      let responseBody;
      if (route.platform === "ningbo") {
        responseBody = handleNingbo(operation, parsed.value, query, db, config);
      } else if (route.platform === "xinleda" && operation === "upfiles") {
        responseBody = xinledaUpload(parsed.value, parsed.raw, headers, db);
      } else if (route.platform === "xinleda") {
        responseBody = handleXinleda(parsed.value, db);
      } else {
        responseBody = handleYongxin(operation, parsed.value, headers, parsed.raw, db, config);
      }
      db.finishRequest(requestId, 200, responseBody);
      json(res, 200, responseBody, {
        "x-mock-platform": route.platform,
        "x-mock-operation": operation,
        "x-mock-duration-ms": String(Date.now() - started)
      });
    } catch (error) {
      const status = Number(error.statusCode ?? 500);
      const body = { error: status === 500 ? "mock server internal error" : error.message };
      if (requestId != null) db.finishRequest(requestId, status, body);
      if (!res.headersSent) json(res, status, body);
      console.error(error);
    }
  });

  server.on("close", () => {
    if (ownsDatabase) db.close();
  });
  return { server, db, config };
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntrypoint) {
  const { server, config } = createMockServer();
  server.listen(config.port, config.host, () => {
    console.log(`shanhuai-integration-mock listening on http://${config.host}:${config.port}`);
  });
}
