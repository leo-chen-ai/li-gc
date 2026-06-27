export type ProjectStatus = "在建" | "筹备" | "完工" | "停工" | "竣工";
export type AttendanceDirection = "进场" | "出场";

export type Project = {
  id: string;
  name: string;
  code: string;
  status: ProjectStatus;
  location: string;
  address: string;
  contractor: string;
  buildUnit: string;
  manager: string;
  managerPhone: string;
  startDate: string;
  finishDate: string;
  investment: string;
  laborCost: string;
  workerCount: number;
  teamCount: number;
  unitCount: number;
  attendanceToday: number;
  attendanceRate: number;
  progress: number;
  risk: "正常" | "关注" | "预警";
  realNameManager: string;
  laborManager: string;
  workPermit: string;
  area: string;
  coordinates: string;
};

export type ConstructionUnit = {
  id: string;
  projectId: string;
  name: string;
  type: string;
  creditCode: string;
  manager: string;
  phone: string;
  workers: number;
  salaryType: string;
};

export type Team = {
  id: string;
  projectId: string;
  unitName: string;
  name: string;
  type: string;
  leader: string;
  phone: string;
  workerCount: number;
  salaryType: string;
  attendanceStart: string;
  attendanceEnd: string;
  status: "正常" | "待完善";
};

export type Worker = {
  id: string;
  projectId: string;
  name: string;
  gender: "男" | "女";
  idCard: string;
  phone: string;
  team: string;
  unit: string;
  workType: string;
  status: "在场" | "离场";
  entryDate: string;
};

export type AttendanceRecord = {
  id: string;
  projectId: string;
  worker: string;
  team: string;
  direction: AttendanceDirection;
  time: string;
  device: string;
  photoUrl?: string;
  status: "有效" | "待补图" | "异常";
};

export const projects: Project[] = [
  {
    id: "p-1001",
    name: "淮安高铁商务区综合体项目",
    code: "SH-GT-2026-001",
    status: "在建",
    location: "江苏省 淮安市 清江浦区",
    address: "枚皋路与淮海南路交叉口东侧",
    contractor: "山淮建设工程有限公司",
    buildUnit: "淮安城发置业有限公司",
    manager: "陈国强",
    managerPhone: "138****7621",
    startDate: "2026-03-18",
    finishDate: "2027-12-30",
    investment: "68,000 万元",
    laborCost: "8,420 万元",
    workerCount: 486,
    teamCount: 18,
    unitCount: 9,
    attendanceToday: 421,
    attendanceRate: 92,
    progress: 36,
    risk: "正常",
    realNameManager: "刘海宁",
    laborManager: "王佳",
    workPermit: "320800202603180101",
    area: "186,000 平方米",
    coordinates: "119.0382, 33.6065",
  },
  {
    id: "p-1002",
    name: "山淮新能源装备厂房二期",
    code: "SH-XNY-2026-004",
    status: "在建",
    location: "江苏省 淮安市 洪泽区",
    address: "洪泽经济开发区东九道北侧",
    contractor: "江苏筑安建筑集团",
    buildUnit: "山淮新能源科技有限公司",
    manager: "赵明",
    managerPhone: "159****2408",
    startDate: "2026-01-08",
    finishDate: "2026-11-20",
    investment: "31,500 万元",
    laborCost: "3,980 万元",
    workerCount: 268,
    teamCount: 11,
    unitCount: 6,
    attendanceToday: 236,
    attendanceRate: 88,
    progress: 58,
    risk: "关注",
    realNameManager: "孙敏",
    laborManager: "许磊",
    workPermit: "320813202601080066",
    area: "82,400 平方米",
    coordinates: "118.8729, 33.2942",
  },
  {
    id: "p-1003",
    name: "清江浦老城更新安置房项目",
    code: "SH-AZF-2025-019",
    status: "筹备",
    location: "江苏省 淮安市 清江浦区",
    address: "延安东路北侧、承德路西侧",
    contractor: "淮安市政建设有限公司",
    buildUnit: "清江浦区城市更新投资公司",
    manager: "周建峰",
    managerPhone: "137****8846",
    startDate: "2026-07-01",
    finishDate: "2028-03-31",
    investment: "96,000 万元",
    laborCost: "11,600 万元",
    workerCount: 74,
    teamCount: 5,
    unitCount: 4,
    attendanceToday: 38,
    attendanceRate: 51,
    progress: 8,
    risk: "预警",
    realNameManager: "陆晨",
    laborManager: "韩越",
    workPermit: "待办理",
    area: "243,000 平方米",
    coordinates: "119.0204, 33.5941",
  },
];

export const constructionUnits: ConstructionUnit[] = [
  { id: "u-1", projectId: "p-1001", name: "山淮建设工程有限公司", type: "总承包单位", creditCode: "91320800MA1SH0001X", manager: "陈国强", phone: "138****7621", workers: 188, salaryType: "按月" },
  { id: "u-2", projectId: "p-1001", name: "淮安城发置业有限公司", type: "建设单位", creditCode: "91320800MA1CF8802K", manager: "李思源", phone: "139****8820", workers: 12, salaryType: "项目管理" },
  { id: "u-3", projectId: "p-1001", name: "苏北劳务工程有限公司", type: "劳务分包单位", creditCode: "91320891MA1LW3019A", manager: "许强", phone: "136****3319", workers: 286, salaryType: "按日" },
  { id: "u-4", projectId: "p-1002", name: "山淮新能源科技有限公司", type: "建设单位", creditCode: "91320829MA1NE0048B", manager: "赵明", phone: "159****2408", workers: 24, salaryType: "项目管理" },
  { id: "u-5", projectId: "p-1002", name: "江苏筑安建筑集团", type: "总承包单位", creditCode: "91320000MA1ZA8812H", manager: "杨坤", phone: "135****8166", workers: 244, salaryType: "按月" },
];

export const teams: Team[] = [
  { id: "t-1", projectId: "p-1001", unitName: "苏北劳务工程有限公司", name: "钢筋一班", type: "钢筋工", leader: "马建军", phone: "138****1001", workerCount: 42, salaryType: "按量", attendanceStart: "06:30", attendanceEnd: "18:30", status: "正常" },
  { id: "t-2", projectId: "p-1001", unitName: "苏北劳务工程有限公司", name: "木工二班", type: "木工", leader: "黄小飞", phone: "138****1002", workerCount: 38, salaryType: "按日", attendanceStart: "06:30", attendanceEnd: "18:00", status: "正常" },
  { id: "t-3", projectId: "p-1001", unitName: "山淮建设工程有限公司", name: "安装综合班", type: "安装工", leader: "沈凯", phone: "138****1003", workerCount: 31, salaryType: "按月", attendanceStart: "07:00", attendanceEnd: "18:00", status: "待完善" },
  { id: "t-4", projectId: "p-1002", unitName: "江苏筑安建筑集团", name: "机电安装班", type: "电工", leader: "高峰", phone: "138****2201", workerCount: 26, salaryType: "按月", attendanceStart: "07:00", attendanceEnd: "18:00", status: "正常" },
];

export const workers: Worker[] = [
  { id: "w-1", projectId: "p-1001", name: "张建国", gender: "男", idCard: "3208**********1132", phone: "138****6112", team: "钢筋一班", unit: "苏北劳务工程有限公司", workType: "钢筋工", status: "在场", entryDate: "2026-03-20" },
  { id: "w-2", projectId: "p-1001", name: "李红梅", gender: "女", idCard: "3208**********2041", phone: "137****8104", team: "木工二班", unit: "苏北劳务工程有限公司", workType: "木工", status: "在场", entryDate: "2026-03-22" },
  { id: "w-3", projectId: "p-1001", name: "周海", gender: "男", idCard: "3208**********7719", phone: "150****4317", team: "安装综合班", unit: "山淮建设工程有限公司", workType: "安装工", status: "离场", entryDate: "2026-04-02" },
  { id: "w-4", projectId: "p-1001", name: "孙志强", gender: "男", idCard: "3208**********0934", phone: "139****8821", team: "钢筋一班", unit: "苏北劳务工程有限公司", workType: "钢筋工", status: "在场", entryDate: "2026-05-16" },
  { id: "w-5", projectId: "p-1002", name: "顾明", gender: "男", idCard: "3208**********4501", phone: "136****2237", team: "机电安装班", unit: "江苏筑安建筑集团", workType: "电工", status: "在场", entryDate: "2026-01-12" },
];

export const attendanceRecords: AttendanceRecord[] = [
  { id: "a-1", projectId: "p-1001", worker: "张建国", team: "钢筋一班", direction: "进场", time: "2026-06-18 06:41:22", device: "南门 01 号闸机", status: "有效" },
  { id: "a-2", projectId: "p-1001", worker: "李红梅", team: "木工二班", direction: "进场", time: "2026-06-18 06:52:08", device: "东门 02 号闸机", status: "有效" },
  { id: "a-3", projectId: "p-1001", worker: "周海", team: "安装综合班", direction: "出场", time: "2026-06-18 11:58:19", device: "生活区人脸机", status: "有效" },
  { id: "a-4", projectId: "p-1002", worker: "顾明", team: "机电安装班", direction: "进场", time: "2026-06-18 07:03:44", device: "厂房南门闸机", status: "有效" },
];

export function findProject(projectId: string) {
  return projects.find((project) => project.id === projectId) ?? projects[0];
}

export function getProjectUnits(projectId: string) {
  return constructionUnits.filter((unit) => unit.projectId === projectId);
}

export function getProjectTeams(projectId: string) {
  return teams.filter((team) => team.projectId === projectId);
}

export function getProjectWorkers(projectId: string) {
  return workers.filter((worker) => worker.projectId === projectId);
}

export function getProjectAttendance(projectId: string) {
  return attendanceRecords.filter((record) => record.projectId === projectId);
}
