import type { ConstructionWorkerPayload } from "../types/construction-types";

const CONSTRUCTION_WORKER_TYPE = 1;
const MANAGER_WORKER_TYPE = 1001;

function isBlank(value: unknown) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return undefined;
}

export function validateWorkerCreatePayload(payload: ConstructionWorkerPayload) {
  if (isBlank(payload.phone)) {
    throw new Error("请填写手机号");
  }

  const workerType = toNumber(payload.worker_type);
  if (workerType === CONSTRUCTION_WORKER_TYPE && isBlank(payload.work_type)) {
    throw new Error("请选择工种");
  }

  if (workerType === MANAGER_WORKER_TYPE && isBlank(payload.manager_type)) {
    throw new Error("请选择人员类型");
  }
}
