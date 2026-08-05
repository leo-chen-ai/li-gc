import { useQuery } from "@tanstack/react-query";

import { supplementalAttendanceService } from "./services";
import type { SupplementalAttendanceListFilters } from "./types";

export const supplementalAttendanceKeys = {
  all: ["supplemental-attendance"] as const,
  records: (filters: SupplementalAttendanceListFilters) =>
    [...supplementalAttendanceKeys.all, "records", filters] as const,
};

export function useSupplementalAttendanceRecordsQuery(
  filters: SupplementalAttendanceListFilters,
) {
  return useQuery({
    queryKey: supplementalAttendanceKeys.records(filters),
    queryFn: () => supplementalAttendanceService.listRecords(filters),
    placeholderData: (previousData) => previousData,
    refetchInterval: 15_000,
  });
}
