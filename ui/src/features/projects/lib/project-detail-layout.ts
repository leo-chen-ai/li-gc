export const DEFAULT_PROJECT_DETAIL_TAB = "操作指引" as const;

export function getProjectInfoCellClassName(index: number, itemCount: number) {
  const isLastOddItem = itemCount % 2 === 1 && index === itemCount - 1;

  return isLastOddItem ? "sm:col-span-2" : "";
}
