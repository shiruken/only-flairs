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
 * Check whether a comment author's flair permits commenting
 * @param flair The author's flair, or `undefined` if the author has none
 * @param allowed Allowed flair template IDs, or `["any"]` for any flair
 * @returns `true` if the author may comment
 */
export function hasAllowedFlair(flair: AuthorFlair | undefined, allowed: string[]): boolean {
  const text = flair?.text ?? "";
  const template_id = flair?.templateId ?? "";
  if (text == "" && template_id == "") {
    return false;
  }
  return allowed.includes("any") || allowed.includes(template_id);
}
