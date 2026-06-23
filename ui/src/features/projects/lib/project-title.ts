const PROJECT_TITLE_MAX_LENGTH = 200;

export function formatProjectTitle(title: string, maxLength = PROJECT_TITLE_MAX_LENGTH) {
  if (title.length <= maxLength) return title;
  return `${title.slice(0, maxLength)}...`;
}
