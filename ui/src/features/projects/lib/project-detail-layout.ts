export function getProjectInfoCellClassName(index: number, itemCount: number) {
  const isLastOddItem = itemCount % 2 === 1 && index === itemCount - 1;

  return isLastOddItem ? "sm:col-span-2" : "";
}
