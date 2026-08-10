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
  ["POST", "/project/V2/query", "project/V2/query"],
  ["POST", "/projectCorp/V2/add", "projectCorp/V2/add"],
  ["POST", "/team/V2/add", "team/V2/add"],
  ["POST", "/worker/V2/add", "worker/V2/add"],
  ["POST", "/entryExit/V2/add", "entryExit/V2/add"],
  ["POST", "/attend/V2/add", "attend/V2/add"],
  ["POST", "/asyncHandleResult/V2/query", "asyncHandleResult/V2/query"],
  ["POST", "/sysFile/V2/uploadImg", "sysFile/V2/uploadImg"]
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
