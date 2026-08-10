import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { DOCUMENTED_INTERFACE_COUNT, routeCatalog } from "../src/catalog.js";
import { createMockServer } from "../src/server.js";

let running;
let baseUrl;

beforeEach(async () => {
  running = createMockServer({
    databasePath: ":memory:",
    host: "127.0.0.1",
    port: 0,
    adminToken: "test-admin-token",
    authMode: "permissive"
  });
  await new Promise((resolve) => running.server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${running.server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => running.server.close(resolve));
});

async function request(path, { method = "POST", body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const value = await response.json();
  assert.equal(response.status, 200, `${method} ${path}: ${JSON.stringify(value)}`);
  return value;
}

test("catalog covers every interface in the three source documents", () => {
  const catalog = routeCatalog();
  assert.equal(DOCUMENTED_INTERFACE_COUNT, 32);
  assert.equal(catalog.ningbo.length, 12);
  assert.equal(catalog.xinleda.length, 12);
  assert.equal(catalog.yongxin.length, 8);
});

test("all 12 Ningbo Housing interfaces support a stateful worker/team lifecycle", async () => {
  await request("/Attendance/Add", { body: { MachineNo: "M1", WorkerCode: "W1" } });

  const missing = await request("/EnterpriseWorker/GetWorkerCode?IdentityCard=330200199001010011&ProjectGuid=g", { method: "GET" });
  assert.equal(missing.WorkerCode, null);

  const createdWorker = await request("/EnterpriseWorker/AddOrUpdateWorker", {
    body: { WorkerName: "张三", IdentityCard: "330200199001010011", Telephone: "13800000000" }
  });
  assert.match(createdWorker.WorkerCode, /^MOCK-WORKER-/);
  const found = await request("/EnterpriseWorker/GetWorkerCode?IdentityCard=330200199001010011&ProjectGuid=g", { method: "GET" });
  assert.equal(found.WorkerCode, createdWorker.WorkerCode);

  await request("/EnterpriseWorker/AddEnterpriseOfWorker", {
    body: { WorkerCode: createdWorker.WorkerCode, CorpCode: "91330200MOCK000001" }
  });
  await request("/EnterpriseWorker/AddContract", {
    body: { WorkerCode: createdWorker.WorkerCode, ContractCode: "C-001" }
  });

  const projects = await request("/Project/GetByFgwCode?FgwCode=FGW-1&CorpCode=91330200MOCK000001", { method: "GET" });
  assert.equal(projects[0].ProjectApartmentId, 1206);

  const team = await request("/Project/AddTeam", {
    body: {
      ProjectApartmentId: 1206,
      CorpCode: "91330200MOCK000001",
      ProjectTeamTypeName: "木工",
      TeamLeaderName: "李四",
      TeamName: "李四木工班组",
      EntryTime: "2026-07-26"
    }
  });
  assert.ok(team.TeamId > 1000);
  const teams = await request("/Project/ListTeams?ProjectApartmentId=1206&TeamName=%E6%9D%8E%E5%9B%9B&Page=1&PageSize=20", { method: "GET" });
  assert.equal(teams.TotalCount, 1);
  assert.equal(teams.List[0].TeamName, "李四木工班组");

  const projectWorker = await request("/Project/AddWorkerV2", {
    body: {
      ProjectApartmentId: 1206,
      TeamId: team.TeamId,
      WorkerCode: createdWorker.WorkerCode,
      IsTeamLeader: false,
      WorkTypeName: "木工",
      EntryTime: "2026-07-26"
    }
  });
  assert.ok(projectWorker.ProjectWorkerId > 1000);
  await request("/Project/EditWorker", {
    body: {
      ProjectApartmentId: 1206,
      ProjectWorkerId: projectWorker.ProjectWorkerId,
      WorkTypeName: "木工",
      EntryTime: "2026-07-26"
    }
  });
  await request("/Project/ProjectWorkerExit", {
    body: { ProjectWorkerId: String(projectWorker.ProjectWorkerId), ExitTime: "2026-07-27" }
  });
  await request("/Project/TeamExit", { body: { TeamId: team.TeamId, ExitTime: "2026-07-27", Files: [] } });
});

test("all 12 Xinleda interfaces support imports, async log queries and file upload", async () => {
  const methods = [
    "company.import",
    "company.safeguard",
    "project.import",
    "project.labourer.entry",
    "project.labourer.attendance",
    "project.commission",
    "project.billboard",
    "project.agreement",
    "project.manager.entry",
    "labourer.import"
  ];
  let asyncToken;
  for (const method of methods) {
    const result = await request("/openapi", {
      body: {
        method,
        version: "1.0",
        appid: "any-app",
        format: "json",
        timestamp: Date.now(),
        nonce: `nonce-${method}`,
        sign: "permissive",
        data: JSON.stringify([{ project_name: "模拟项目", real_name: "张三" }])
      }
    });
    assert.ok([0, 20].includes(Number(result.code)));
    if (method === "company.import") asyncToken = result.data;
    if (method === "project.import") {
      assert.match(result.token, /^xinleda-/);
      assert.match(result.data, /MOCK-XLD-PROJECT/);
    }
  }
  const log = await request("/openapi", {
    body: {
      method: "unifiedlog.get",
      version: "1.0",
      appid: "any-app",
      format: "json",
      timestamp: Date.now(),
      nonce: "log-nonce",
      sign: "permissive",
      data: asyncToken
    }
  });
  assert.equal(log.code, 0);
  assert.equal(log.data.status, 3);
  assert.equal(log.data.method, "company.import");

  const form = new FormData();
  form.append("files", new Blob(["mock-image"], { type: "image/jpeg" }), "photo.jpg");
  const uploadResponse = await fetch(`${baseUrl}/upfiles?appid=any-app&timestamp=${Date.now()}&sign=x`, {
    method: "POST",
    body: form
  });
  assert.equal(uploadResponse.status, 200);
  const uploaded = await uploadResponse.json();
  assert.equal(uploaded.code, 0);
  assert.match(uploaded.data, /^\/mock-files\/xinleda\//);
});

test("all 8 Yongxin interfaces support project/team/async/file flows", async () => {
  const project = await request("/project/V2/query", { body: {} });
  assert.equal(project.code, 0);
  assert.equal(project.data.projectCode, "MOCK-PROJECT-001");
  await request("/projectCorp/V2/add", { body: { corpName: "模拟单位" } });
  const team = await request("/team/V2/add", { body: { teamName: "测试班组" } });
  assert.match(team.data.teamSysNo, /^MOCK-TEAM-/);

  const worker = await request("/worker/V2/add", { body: { name: "张三", teamSysNo: team.data.teamSysNo } });
  const entry = await request("/entryExit/V2/add", { body: { name: "张三", type: 1 } });
  const attendance = await request("/attend/V2/add", { body: { name: "张三", direction: 1 } });
  for (const response of [worker, entry, attendance]) assert.match(response.data.requestSerialCode, /^yongxin-/);

  const result = await request("/asyncHandleResult/V2/query", {
    body: { requestSerialCode: worker.data.requestSerialCode }
  });
  assert.equal(result.data.state, "2");

  const uploaded = await request("/sysFile/V2/uploadImg", {
    body: { appKey: "anything", fileBase: Buffer.from("image").toString("base64"), fileType: "jpg" }
  });
  assert.match(uploaded.data, /^\/mock-files\/yongxin\//);
});

test("strict mode checks the documented signatures", async () => {
  await new Promise((resolve) => running.server.close(resolve));
  running = createMockServer({
    databasePath: ":memory:",
    host: "127.0.0.1",
    port: 0,
    adminToken: "test-admin-token",
    authMode: "strict"
  });
  await new Promise((resolve) => running.server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${running.server.address().port}`;

  const curTime = Math.floor(Date.now() / 1000) - 946684800;
  const checksum = createHash("sha256").update(`mock-ningbo-secret${curTime}`).digest("hex");
  const ok = await request("/Project/GetByFgwCode?FgwCode=1&CorpCode=2", {
    method: "GET",
    headers: { AppKey: "mock-ningbo-app-key", CurTime: String(curTime), Checksum: checksum }
  });
  assert.equal(ok[0].ProjectApartmentId, 1206);

  const xinledaBody = {
    method: "company.import",
    version: "1.0",
    appid: "mock-xinleda-app",
    format: "json",
    timestamp: Date.now(),
    nonce: "strict-xinleda-nonce",
    data: "[]"
  };
  const xinledaSource = Object.keys(xinledaBody).sort()
    .map((key) => `${key}=${xinledaBody[key]}`)
    .join("&") + "&appsecret=1234567890abcdef";
  xinledaBody.sign = createHash("sha256").update(xinledaSource.toLowerCase()).digest("hex");
  const xinleda = await request("/openapi", { body: xinledaBody });
  assert.equal(xinleda.code, 20);

  const replayResponse = await fetch(`${baseUrl}/openapi`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(xinledaBody)
  });
  assert.equal(replayResponse.status, 200);
  assert.equal((await replayResponse.json()).code, 4);

  const badXinledaBody = { ...xinledaBody, nonce: "bad-sign-nonce", sign: "0".repeat(64) };
  const badXinledaResponse = await fetch(`${baseUrl}/openapi`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(badXinledaBody)
  });
  assert.equal((await badXinledaResponse.json()).code, -2);

  const expiredXinledaBody = { ...xinledaBody, timestamp: Date.now() - 20 * 60 * 1000, nonce: "expired-nonce" };
  const expiredXinledaSource = Object.keys(expiredXinledaBody).filter((key) => key !== "sign").sort()
    .map((key) => `${key}=${expiredXinledaBody[key]}`)
    .join("&") + "&appsecret=1234567890abcdef";
  expiredXinledaBody.sign = createHash("sha256").update(expiredXinledaSource.toLowerCase()).digest("hex");
  const expiredXinledaResponse = await fetch(`${baseUrl}/openapi`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(expiredXinledaBody)
  });
  assert.equal((await expiredXinledaResponse.json()).code, -1);

  const uploadTimestamp = String(Date.now());
  const uploadSign = createHash("sha256")
    .update(`appid=mock-xinleda-app&timestamp=${uploadTimestamp}&appsecret=1234567890abcdef`)
    .digest("hex");
  const form = new FormData();
  form.append("files", new Blob(["strict-upload"]), "strict.txt");
  const upload = await fetch(`${baseUrl}/upfiles?appid=mock-xinleda-app&timestamp=${uploadTimestamp}&sign=${uploadSign}`, {
    method: "POST",
    body: form
  });
  assert.equal(upload.status, 200);

  const yongxinTimestamp = String(Date.now());
  const yongxinSign = createHash("md5")
    .update(`mock-yongxin-app&1234567890abcdef&${yongxinTimestamp}`)
    .digest("hex");
  const yongxin = await request("/project/V2/query", {
    body: {},
    headers: {
      projectCode: "MOCK-PROJECT-001",
      appKey: "mock-yongxin-app",
      timestamp: yongxinTimestamp,
      sign: yongxinSign
    }
  });
  assert.equal(yongxin.code, 0);

  async function invalidYongxin(headers, body = {}) {
    const response = await fetch(`${baseUrl}/project/V2/query`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body)
    });
    assert.equal(response.status, 200);
    return response.json();
  }
  assert.equal((await invalidYongxin({
    projectCode: "MOCK-PROJECT-001", appKey: "wrong-key", timestamp: yongxinTimestamp, sign: yongxinSign
  })).code, 2002);
  assert.equal((await invalidYongxin({
    projectCode: "WRONG-PROJECT", appKey: "mock-yongxin-app", timestamp: yongxinTimestamp, sign: yongxinSign
  })).code, 2006);
  const expiredYongxinTimestamp = String(Date.now() - 20 * 60 * 1000);
  const expiredYongxinSign = createHash("md5")
    .update(`mock-yongxin-app&1234567890abcdef&${expiredYongxinTimestamp}`).digest("hex");
  assert.equal((await invalidYongxin({
    projectCode: "MOCK-PROJECT-001", appKey: "mock-yongxin-app", timestamp: expiredYongxinTimestamp, sign: expiredYongxinSign
  })).code, 2004);
  assert.equal((await invalidYongxin({
    projectCode: "MOCK-PROJECT-001", appKey: "mock-yongxin-app", timestamp: yongxinTimestamp, sign: "bad-sign"
  })).code, 2005);
  assert.equal((await invalidYongxin({})).code, 2007);

  const invalidUpload = await fetch(`${baseUrl}/sysFile/V2/uploadImg`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appKey: "wrong-key", fileBase: "dGVzdA==", fileType: "jpg" })
  });
  assert.equal((await invalidUpload.json()).code, 2002);

  const rejected = await fetch(`${baseUrl}/Project/GetByFgwCode?FgwCode=1&CorpCode=2`);
  assert.equal(rejected.status, 401);
  assert.match((await rejected.json()).Message, /缺少/);

  const badChecksum = await fetch(`${baseUrl}/Project/GetByFgwCode?FgwCode=1&CorpCode=2`, {
    headers: { AppKey: "mock-ningbo-app-key", CurTime: String(curTime), Checksum: "bad-checksum" }
  });
  assert.equal(badChecksum.status, 401);
  assert.match((await badChecksum.json()).Message, /Checksum/);

  const expiredCurTime = curTime - 3 * 60 * 60;
  const expiredChecksum = createHash("sha256").update(`mock-ningbo-secret${expiredCurTime}`).digest("hex");
  const expiredNingbo = await fetch(`${baseUrl}/Project/GetByFgwCode?FgwCode=1&CorpCode=2`, {
    headers: { AppKey: "mock-ningbo-app-key", CurTime: String(expiredCurTime), Checksum: expiredChecksum }
  });
  assert.equal(expiredNingbo.status, 401);
  assert.match((await expiredNingbo.json()).Message, /2 小时/);
});

test("admin API records requests and injects deterministic transient faults", async () => {
  const adminHeaders = { authorization: "Bearer test-admin-token", "content-type": "application/json" };
  const fault = await fetch(`${baseUrl}/__mock/faults`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      platform: "yongxin",
      operation: "attend/V2/add",
      remaining: 1,
      status: 503,
      body: { code: 503, msg: "retry me" }
    })
  });
  assert.equal(fault.status, 201);

  const failed = await fetch(`${baseUrl}/attend/V2/add`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "张三" })
  });
  assert.equal(failed.status, 503);
  const recovered = await request("/attend/V2/add", { body: { name: "张三" } });
  assert.equal(recovered.code, 0);

  const response = await fetch(`${baseUrl}/__mock/requests?platform=yongxin&operation=attend%2FV2%2Fadd`, {
    headers: { authorization: "Bearer test-admin-token" }
  });
  assert.equal(response.status, 200);
  const history = await response.json();
  assert.equal(history.data.length, 2);
  assert.deepEqual(history.data.map((item) => item.responseStatus).sort(), [200, 503]);
});
