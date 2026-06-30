const { request, uploadFile } = require("../config/api.js");

const SELECTED_PROJECT_KEY = "shanhuai_selected_project";

function normalizeProject(project) {
  return {
    ...project,
    id: project.id,
    title: project.name || project.title || "未命名项目",
    developerName: project.build_unit || project.contractor || project.developerName || "已授权项目",
    location: project.address_code_list || project.address || project.location || "小程序可管理",
    metric: project.work_permit ? `施工许可证 ${project.work_permit}` : project.metric || "查看详情",
  };
}

function getSelectedProject() {
  const project = wx.getStorageSync(SELECTED_PROJECT_KEY);
  if (project && project.id) return project;

  const projects = wx.getStorageSync("shanhuai_managed_projects");
  if (Array.isArray(projects) && projects.length > 0) {
    const first = normalizeProject(projects[0]);
    setSelectedProject(first);
    return first;
  }

  return null;
}

function setSelectedProject(project) {
  const normalized = normalizeProject(project);
  wx.setStorageSync(SELECTED_PROJECT_KEY, normalized);
  return normalized;
}

function clearSelectedProject() {
  wx.removeStorageSync(SELECTED_PROJECT_KEY);
}

async function listProjectOptions() {
  const projects = await request({ url: "/miniapp/projects/options" });
  return Array.isArray(projects) ? projects.map(normalizeProject) : [];
}

function ensureProjectId(projectId) {
  const id = projectId || (getSelectedProject() || {}).id;
  if (!id) throw new Error("请先选择项目");
  return id;
}

function queryString(params = {}) {
  const pairs = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`);
  return pairs.length ? `?${pairs.join("&")}` : "";
}

function projectUrl(projectId, path = "", params) {
  const suffix = path ? `/${path.replace(/^\/+/, "")}` : "";
  return `/miniapp/projects/${ensureProjectId(projectId)}${suffix}${queryString(params)}`;
}

function listResource(projectId, resource, params) {
  return request({ url: projectUrl(projectId, resource, params) });
}

function getResource(projectId, resource, id) {
  return request({ url: projectUrl(projectId, `${resource}/${id}`) });
}

function createResource(projectId, resource, data) {
  return request({ url: projectUrl(projectId, resource), method: "POST", data });
}

function updateResource(projectId, resource, id, data) {
  return request({ url: projectUrl(projectId, `${resource}/${id}`), method: "PATCH", data });
}

function deleteResource(projectId, resource, id) {
  return request({ url: projectUrl(projectId, `${resource}/${id}`), method: "DELETE" });
}

function uploadConstructionFile(filePath, context = {}) {
  return uploadFile({
    filePath,
    formData: {
      biz_type: context.bizType || "construction",
      biz_id: context.bizId || "",
      field_key: context.fieldKey || "",
    },
  });
}

module.exports = {
  SELECTED_PROJECT_KEY,
  clearSelectedProject,
  createResource,
  deleteResource,
  getResource,
  getSelectedProject,
  listProjectOptions,
  listResource,
  normalizeProject,
  setSelectedProject,
  updateResource,
  uploadConstructionFile,
};
