/**
 * Minimal user flair fields shared by trigger event data and the Reddit API
 */
export type AuthorFlair = {
  /** Plain text of the flair */
  text?: string | undefined;
  /** Flair template ID */
  templateId?: string | undefined;
};

/**
 * Format author flair for log output
 * @param flair AuthorFlair object or undefined
 * @returns Formatted flair string, or `"none"` if undefined
 */
export function formatFlair(flair: AuthorFlair | undefined): string {
  if (!flair) {
    return "none";
  }
  return `text="${flair.text ?? ""}", templateId="${flair.templateId ?? ""}"`;
}

/**
 * Check whether a comment author's flair permits commenting
 * @param flair The author's flair, or `undefined` if the author has none
 * @param allowed Allowed flair template IDs, or `["any"]` for any flair
 * @returns `true` if the author may comment
 */
export function hasAllowedFlair(flair: AuthorFlair | undefined, allowed: string[]): boolean {
  const text = flair?.text?.trim() ?? "";
  const template_id = flair?.templateId?.trim() ?? "";
  if (text == "" && template_id == "") {
    return false;
  }
  return allowed.includes("any") || allowed.includes(template_id);
}
