import type { JSONObject } from "@devvit/public-api";
import type { PostSettings } from "./types.js";

/** Option values for on/off select fields */
export const ENABLED = "enabled";
export const DISABLED = "disabled";
export const YES = "yes";
export const NO = "no";

/**
 * Parse an on/off form value into a boolean
 *
 * Accepts the select field format (`["enabled"]`) as well as plain strings and
 * legacy boolean values, since boolean form fields are unreliable on mobile
 * @param value Raw form value
 * @param true_value Option value that represents `true`
 * @returns `true` if the value matches `true_value`, otherwise `false`
 */
export function parseFlag(value: unknown, true_value: string): boolean {
  if (Array.isArray(value)) {
    value = value[0];
  }
  if (typeof value === "boolean") {
    return value;
  }
  return value === true_value || value === "true";
}

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
    console.warn("No flair selected, defaulting to 'any'");
  }
  if (flairs.length > 1 && flairs.includes("any")) {
    flairs = [ "any" ];
    console.warn("Flairs selected in addition to 'any', forcing 'any'");
  }

  const removal_reasons = Array.isArray(values.removal_reason) ? values.removal_reason.map(String) : [];
  if (removal_reasons.length == 0) {
    removal_reasons.push("none");
    console.warn("No removal reason selected, defaulting to 'none'");
  }

  const expiration = Array.isArray(values.expiration) ? values.expiration[0] : values.expiration;

  return {
    post_id: post_id,
    is_enabled: parseFlag(values.is_enabled, ENABLED),
    flairs: flairs,
    top_level_only: parseFlag(values.top_level_only, YES),
    exclude_mods: parseFlag(values.exclude_mods, YES),
    expiration: Number(expiration ?? 0),
    removal_reason: removal_reasons[0],
    // Empty paragraph fields are omitted from the submitted values
    sticky_comment_text: typeof values.sticky_comment_text === "string" ? values.sticky_comment_text : "",
  };
}
