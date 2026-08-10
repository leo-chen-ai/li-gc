import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

const baseUrl = (process.env.MOCK_BASE_URL ?? process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const adminToken = process.env.MOCK_ADMIN_TOKEN ?? "";
const credentials = {
  ningboAppKey: process.env.MOCK_NINGBO_APP_KEY ?? "mock-ningbo-app-key",
  ningboAppSecret: process.env.MOCK_NINGBO_APP_SECRET ?? "mock-ningbo-secret",
  ningboProjectId: Number(process.env.MOCK_NINGBO_PROJECT_ID ?? 1206),
  ningboProjectGuid: process.env.MOCK_NINGBO_PROJECT_GUID ?? "00000000-0000-0000-0000-000000001206",
  xinledaAppId: process.env.MOCK_XINLEDA_APP_ID ?? "mock-xinleda-app",
  xinledaAppSecret: process.env.MOCK_XINLEDA_APP_SECRET ?? "1234567890abcdef",
  yongxinAppKey: process.env.MOCK_YONGXIN_APP_KEY ?? "mock-yongxin-app",
  yongxinAppSecret: process.env.MOCK_YONGXIN_APP_SECRET ?? "1234567890abcdef",
  yongxinProjectCode: process.env.MOCK_YONGXIN_PROJECT_CODE ?? "MOCK-PROJECT-001"
};

const calls = [];
const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;

function digest(algorithm, value) {
  return createHash(algorithm).update(value).digest("hex");
}

async function call(platform, operation, path, { method = "POST", body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let value;
  try { value = JSON.parse(text); } catch { value = text; }
  assert.ok(response.ok, `${platform} ${operation}: HTTP ${response.status} ${text}`);
  calls.push({ platform, operation, status: response.status });
  return value;
}

function ningboHeaders() {
  const curTime = String(Math.floor(Date.now() / 1000) - 946_684_800);
  return {
    AppKey: credentials.ningboAppKey,
    CurTime: curTime,
    Checksum: digest("sha256", `${credentials.ningboAppSecret}${curTime}`)
  };
}

async function ningbo(operation, path, options = {}) {
  return call("ningbo", operation, path, { ...options, headers: { ...ningboHeaders(), ...options.headers } });
}

function xinledaBody(method, data) {
  const body = {
    method,
    version: "1.0",
    appid: credentials.xinledaAppId,
    format: "json",
    timestamp: Date.now(),
    nonce: randomUUID().replaceAll("-", ""),
    data: typeof data === "string" ? data : JSON.stringify(data)
  };
  const source = Object.keys(body).sort().map((key) => `${key}=${body[key]}`).join("&")
    + `&appsecret=${credentials.xinledaAppSecret}`;
  return { ...body, sign: digest("sha256", source.toLowerCase()) };
}

async function xinleda(method, data) {
  return call("xinleda", method, "/openapi", { body: xinledaBody(method, data) });
}

function yongxinHeaders() {
  const timestamp = String(Date.now());
  return {
    projectCode: credentials.yongxinProjectCode,
    appKey: credentials.yongxinAppKey,
    timestamp,
    sign: digest("md5", `${credentials.yongxinAppKey}&${credentials.yongxinAppSecret}&${timestamp}`)
  };
}

async function yongxin(operation, path, body) {
  return call("yongxin", operation, path, { body, headers: yongxinHeaders() });
}

const health = await call("system", "health", "/health", { method: "GET" });
assert.equal(health.status, "ok");

const identityCard = `MOCK-ID-${runId}`;
await ningbo("Attendance/Add", "/Attendance/Add", {
  body: { MachineNo: "MOCK-MACHINE", WorkerName: "烟测工人", WorkerCode: `WC-${runId}`, AttendTime: "2026-07-26 09:00:00" }
});
await ningbo("EnterpriseWorker/GetWorkerCode", `/EnterpriseWorker/GetWorkerCode?IdentityCard=${encodeURIComponent(identityCard)}&ProjectGuid=${credentials.ningboProjectGuid}`, { method: "GET" });
const worker = await ningbo("EnterpriseWorker/AddOrUpdateWorker", "/EnterpriseWorker/AddOrUpdateWorker", {
  body: { WorkerName: "烟测工人", IdentityCard: identityCard, Address: "宁波", GrantOrg: "宁波公安", Telephone: "13800000000", NationalName: "中国", NationName: "汉", IdCardPhoto: "dGVzdA==", PoliticalAffName: "群众", CultureLevelTypeName: "高中", WorkerType: 1, IsJoined: false, FacePhoto: "dGVzdA==" }
});
await ningbo("EnterpriseWorker/AddEnterpriseOfWorker", "/EnterpriseWorker/AddEnterpriseOfWorker", {
  body: { EnterpriseName: "烟测单位", CorpCode: "91330200MOCK000001", WorkerCode: worker.WorkerCode, WorkDate: "2026-07-26", CurrentWorkTypeName: "木工" }
});
await ningbo("EnterpriseWorker/AddContract", "/EnterpriseWorker/AddContract", {
  body: { WorkerCode: worker.WorkerCode, CorpCode: "91330200MOCK000001", ContractCode: `C-${runId}`, ContractPeriodType: 0 }
});
await ningbo("Project/GetByFgwCode", "/Project/GetByFgwCode?FgwCode=MOCK-FGW&CorpCode=91330200MOCK000001", { method: "GET" });
const team = await ningbo("Project/AddTeam", "/Project/AddTeam", {
  body: { ProjectApartmentId: credentials.ningboProjectId, CorpCode: "91330200MOCK000001", ProjectTeamTypeName: "木工", TeamLeaderName: "烟测班组长", TeamName: `烟测班组-${runId}`, EntryTime: "2026-07-26", Files: [] }
});
await ningbo("Project/ListTeams", `/Project/ListTeams?ProjectApartmentId=${credentials.ningboProjectId}&TeamName=${encodeURIComponent(`烟测班组-${runId}`)}&Page=1&PageSize=20`, { method: "GET" });
const projectWorker = await ningbo("Project/AddWorkerV2", "/Project/AddWorkerV2", {
  body: { ProjectApartmentId: credentials.ningboProjectId, TeamId: team.TeamId, WorkerCode: worker.WorkerCode, IsTeamLeader: false, WorkTypeName: "木工", EntryTime: "2026-07-26" }
});
await ningbo("Project/EditWorker", "/Project/EditWorker", {
  body: { ProjectApartmentId: credentials.ningboProjectId, ProjectWorkerId: projectWorker.ProjectWorkerId, IsTeamLeader: false, WorkTypeName: "木工", EntryTime: "2026-07-26" }
});
await ningbo("Project/ProjectWorkerExit", "/Project/ProjectWorkerExit", {
  body: { ProjectWorkerId: String(projectWorker.ProjectWorkerId), ExitTime: "2026-07-27" }
});
await ningbo("Project/TeamExit", "/Project/TeamExit", { body: { TeamId: team.TeamId, ExitTime: "2026-07-27", Files: [] } });

const xinledaMethods = [
  "company.import", "company.safeguard", "project.import", "project.labourer.entry",
  "project.labourer.attendance", "project.commission", "project.billboard", "project.agreement",
  "project.manager.entry", "labourer.import"
];
let xinledaToken;
for (const method of xinledaMethods) {
  const response = await xinleda(method, [{ project_name: `烟测项目-${runId}`, real_name: "烟测工人", project_code: `XLD-${runId}` }]);
  assert.ok([0, 20].includes(Number(response.code)), `${method} returned ${JSON.stringify(response)}`);
  if (method === "company.import") xinledaToken = response.data;
}
const xinledaLog = await xinleda("unifiedlog.get", xinledaToken);
assert.equal(xinledaLog.data.status, 3);
const uploadTimestamp = String(Date.now());
const uploadSign = digest("sha256", `appid=${credentials.xinledaAppId}&timestamp=${uploadTimestamp}&appsecret=${credentials.xinledaAppSecret}`.toLowerCase());
const form = new FormData();
form.append("files", new Blob([`smoke-${runId}`], { type: "text/plain" }), "smoke.txt");
const uploadResponse = await fetch(`${baseUrl}/upfiles?appid=${credentials.xinledaAppId}&timestamp=${uploadTimestamp}&sign=${uploadSign}`, { method: "POST", body: form });
assert.equal(uploadResponse.status, 200);
const uploadBody = await uploadResponse.json();
assert.equal(uploadBody.code, 0);
calls.push({ platform: "xinleda", operation: "upfiles", status: uploadResponse.status });

await yongxin("project/V2/query", "/project/V2/query", {});
await yongxin("projectCorp/V2/add", "/projectCorp/V2/add", { corpName: "烟测参建单位", corpCode: "91330200MOCK000001" });
const yongxinTeam = await yongxin("team/V2/add", "/team/V2/add", { corpCode: "91330200MOCK000001", teamName: `甬薪烟测班组-${runId}` });
const yongxinWorker = await yongxin("worker/V2/add", "/worker/V2/add", { teamSysNo: yongxinTeam.data.teamSysNo, name: "烟测工人" });
await yongxin("entryExit/V2/add", "/entryExit/V2/add", { teamSysNo: yongxinTeam.data.teamSysNo, name: "烟测工人", type: 1, date: "2026-07-26 09:00:00" });
await yongxin("attend/V2/add", "/attend/V2/add", { name: "烟测工人", direction: 1, date: "2026-07-26 09:00:00", attendType: 0 });
const asyncResult = await yongxin("asyncHandleResult/V2/query", "/asyncHandleResult/V2/query", { requestSerialCode: yongxinWorker.data.requestSerialCode });
assert.equal(asyncResult.data.state, "2");
await call("yongxin", "sysFile/V2/uploadImg", "/sysFile/V2/uploadImg", {
  body: { appKey: credentials.yongxinAppKey, fileBase: Buffer.from("smoke").toString("base64"), fileType: "jpg" }
});

const documentedCalls = calls.filter((item) => item.platform !== "system");
assert.equal(documentedCalls.length, 32);
assert.deepEqual(
  Object.fromEntries(["ningbo", "xinleda", "yongxin"].map((platform) => [platform, documentedCalls.filter((item) => item.platform === platform).length])),
  { ningbo: 12, xinleda: 12, yongxin: 8 }
);

if (adminToken) {
  const response = await fetch(`${baseUrl}/__mock/routes`, { headers: { authorization: `Bearer ${adminToken}` } });
  assert.equal(response.status, 200);
  const catalog = await response.json();
  assert.equal(catalog.documentedInterfaceCount, 32);
}

console.log(JSON.stringify({ success: true, baseUrl, runId, documentedCalls: 32, byPlatform: { ningbo: 12, xinleda: 12, yongxin: 8 } }));
