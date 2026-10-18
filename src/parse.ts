import type { JSONObject } from "@devvit/public-api";
import type { PostSettings } from "./types.js";
import { logger } from "./logger.js";

/** Option values for the `exemptions` multi-select field */
export const EXEMPT_MODS = "mods";
export const EXEMPT_AUTHOR = "author";
export const EXEMPT_REPLIES = "replies";

/**
 * Convert a submitted form into a {@link PostSettings} object
 * @param values Raw form values from a FormOnSubmitEvent
 * @param post_id A Reddit post ID (including `t3_` prefix)
 * @returns A {@link PostSettings} object with a fixed key order
 */
export function parseFormValues(values: JSONObject, post_id: string): PostSettings {
  let flairs = Array.isArray(values.flairs) ? values.flairs.map(String) : [];
  if (flairs.length == 0) {
    flairs = [ "any" ];
    logger.form.warn("No flair selected, defaulting to 'any'");
  }
  if (flairs.length > 1 && flairs.includes("any")) {
    flairs = [ "any" ];
    logger.form.warn("Flairs selected in addition to 'any', forcing 'any'");
  }
  flairs.sort();

  const removal_reasons = Array.isArray(values.removal_reason) ? values.removal_reason.map(String) : [];
  if (removal_reasons.length == 0) {
    removal_reasons.push("none");
    logger.form.warn("No removal reason selected, defaulting to 'none'");
  }

  const expiration = Array.isArray(values.expiration) ? values.expiration[0] : values.expiration;

  // A multi-select replaces boolean fields, which mobile clients reset to their
  // default after they scroll out of view. An empty selection may be omitted.
  const exemptions = Array.isArray(values.exemptions) ? values.exemptions.map(String) : [];

  return {
    post_id: post_id,
    // Saving the form enables restrictions. The Remove Flair Restriction action disables them.
    is_enabled: true,
    flairs: flairs,
    top_level_only: exemptions.includes(EXEMPT_REPLIES),
    exclude_mods: exemptions.includes(EXEMPT_MODS),
    exclude_author: exemptions.includes(EXEMPT_AUTHOR),
    expiration: Number(expiration ?? 0),
    removal_reason: removal_reasons[0],
    // Empty paragraph fields are omitted from the submitted values
    sticky_comment_text: typeof values.sticky_comment_text === "string" ? values.sticky_comment_text : "",
  };
}
