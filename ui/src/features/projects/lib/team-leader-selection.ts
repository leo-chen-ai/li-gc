type TeamLeaderWorker = {
  id: string;
  name?: string | null;
  phone?: string | null;
  id_card?: string | null;
};

export function buildTeamLeaderPatch(
  workers: TeamLeaderWorker[] | undefined,
  workerId: string
) {
  const worker = workers?.find((item) => item.id === workerId);

  return {
    leader_id: workerId,
    leader_name: worker?.name ?? "",
    leader_phone: worker?.phone ?? "",
    leader_id_card: worker?.id_card ?? "",
  };
}
