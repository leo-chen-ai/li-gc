export const NINGBO_ROUTES = [
  ["POST", "/Attendance/Add", "Attendance/Add"],
  ["GET", "/EnterpriseWorker/GetWorkerCode", "EnterpriseWorker/GetWorkerCode"],
  ["POST", "/EnterpriseWorker/AddOrUpdateWorker", "EnterpriseWorker/AddOrUpdateWorker"],
  ["POST", "/EnterpriseWorker/AddEnterpriseOfWorker", "EnterpriseWorker/AddEnterpriseOfWorker"],
  ["POST", "/EnterpriseWorker/AddContract", "EnterpriseWorker/AddContract"],
  ["GET", "/Project/GetByFgwCode", "Project/GetByFgwCode"],
  ["POST", "/Project/AddTeam", "Project/AddTeam"],
  ["POST", "/Project/TeamExit", "Project/TeamExit"],
  ["GET", "/Project/ListTeams", "Project/ListTeams"],
  ["POST", "/Project/AddWorkerV2", "Project/AddWorkerV2"],
  ["POST", "/Project/EditWorker", "Project/EditWorker"],
  ["POST", "/Project/ProjectWorkerExit", "Project/ProjectWorkerExit"]
];

export const XINLEDA_METHODS = [
  "unifiedlog.get",
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

export const YONGXIN_ROUTES = [
  ["POST", "/project/v1/query", "project/v1/query"],
  ["POST", "/projectCorp/v2/add", "projectCorp/v2/add"],
  ["POST", "/team/v2/add", "team/v2/add"],
  ["POST", "/worker/v2/add", "worker/v2/add"],
  ["POST", "/entryExit/v2/add", "entryExit/v2/add"],
  ["POST", "/attend/v2/add", "attend/v2/add"],
  ["POST", "/asyncHandleResult/v1/query", "asyncHandleResult/v1/query"],
  ["POST", "/sysFile/v1/uploadImg", "sysFile/v1/uploadImg"]
];

export const DOCUMENTED_INTERFACE_COUNT =
  NINGBO_ROUTES.length + XINLEDA_METHODS.length + 1 + YONGXIN_ROUTES.length;

export function routeCatalog() {
  return {
    documentedInterfaceCount: DOCUMENTED_INTERFACE_COUNT,
    ningbo: NINGBO_ROUTES.map(([method, path, operation]) => ({ method, path, operation })),
    xinleda: [
      { method: "POST", path: "/upfiles", operation: "upfiles" },
      ...XINLEDA_METHODS.map((operation) => ({
        method: "POST",
        path: "/openapi",
        operation
      }))
    ],
    yongxin: YONGXIN_ROUTES.map(([method, path, operation]) => ({ method, path, operation }))
  };
}
