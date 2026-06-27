type WorkerResourceRef = {
  team_id?: string | null;
  unit_id?: string | null;
  is_deleted?: boolean | null;
};

function incrementCount(counts: Map<string, number>, id: string | null | undefined) {
  if (!id) return;
  counts.set(id, (counts.get(id) ?? 0) + 1);
}

export function countActiveWorkersByTeamId(workers: WorkerResourceRef[]) {
  const counts = new Map<string, number>();

  for (const worker of workers) {
    if (worker.is_deleted) continue;
    incrementCount(counts, worker.team_id);
  }

  return counts;
}

export function countActiveWorkersByUnitId(workers: WorkerResourceRef[]) {
  const counts = new Map<string, number>();

  for (const worker of workers) {
    if (worker.is_deleted) continue;
    incrementCount(counts, worker.unit_id);
  }

  return counts;
}
