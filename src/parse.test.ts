import { describe, expect, test } from "vitest";
import { parseFlag, parseFormValues } from "./parse.js";

// Values as submitted by the select-based form, captured shape from playtest logs
const BASE = {
  is_enabled: [ "enabled" ],
  flairs: [ "any" ],
  top_level_only: [ "no" ],
  exclude_mods: [ "yes" ],
  removal_reason: [ "none" ],
  expiration: [ "2592000" ],
};

describe("parseFlag", () => {
  test.each([
    [ [ "enabled" ], true ],
    [ [ "disabled" ], false ],
    [ "enabled", true ],
    [ "disabled", false ],
    [ true, true ],
    [ false, false ],
    [ "true", true ],
    [ undefined, false ],
    [ [], false ],
  ])("%j -> %s", (value, expected) => {
    expect(parseFlag(value, "enabled")).toBe(expected);
  });
});

describe("parseFormValues", () => {
  test("parses a typical enable submission", () => {
    expect(parseFormValues(BASE, "t3_abc")).toEqual({
      post_id: "t3_abc",
      is_enabled: true,
      flairs: [ "any" ],
      top_level_only: false,
      exclude_mods: true,
      expiration: 2592000,
      removal_reason: "none",
      sticky_comment_text: "",
    });
  });

  test("treats omitted sticky comment as empty", () => {
    // Playtest logs showed no `sticky_comment_text` key when the box was empty
    expect(parseFormValues(BASE, "t3_abc").sticky_comment_text).toBe("");
  });

  test("keeps sticky comment text", () => {
    const settings = parseFormValues({ ...BASE, sticky_comment_text: "Flaired only: %%flair%%" }, "t3_abc");
    expect(settings.sticky_comment_text).toBe("Flaired only: %%flair%%");
  });

  test("parses disabled and yes/no flags", () => {
    const settings = parseFormValues(
      { ...BASE, is_enabled: [ "disabled" ], top_level_only: [ "yes" ], exclude_mods: [ "no" ] },
      "t3_abc",
    );
    expect(settings.is_enabled).toBe(false);
    expect(settings.top_level_only).toBe(true);
    expect(settings.exclude_mods).toBe(false);
  });

  test("parses native boolean toggle submissions", () => {
    const booleanSubmission = {
      is_enabled: true,
      flairs: [ "any" ],
      top_level_only: true,
      exclude_mods: false,
      removal_reason: [ "none" ],
      expiration: [ "2592000" ],
    };
    const settings = parseFormValues(booleanSubmission, "t3_abc");
    expect(settings.is_enabled).toBe(true);
    expect(settings.top_level_only).toBe(true);
    expect(settings.exclude_mods).toBe(false);
  });

  test("defaults empty flair selection to any", () => {
    expect(parseFormValues({ ...BASE, flairs: [] }, "t3_abc").flairs).toEqual([ "any" ]);
  });

  test("forces any when selected with other flairs", () => {
    expect(parseFormValues({ ...BASE, flairs: [ "any", "f1" ] }, "t3_abc").flairs).toEqual([ "any" ]);
  });

  test("keeps specific flairs", () => {
    expect(parseFormValues({ ...BASE, flairs: [ "f1", "f2" ] }, "t3_abc").flairs).toEqual([ "f1", "f2" ]);
  });

  test("defaults missing removal reason to none", () => {
    expect(parseFormValues({ ...BASE, removal_reason: [] }, "t3_abc").removal_reason).toBe("none");
  });

  test("parses never expiring", () => {
    expect(parseFormValues({ ...BASE, expiration: [ "0" ] }, "t3_abc").expiration).toBe(0);
  });

  test("produces identical JSON regardless of submitted key order", () => {
    // Change detection in processForm compares JSON strings
    const reordered = {
      expiration: [ "2592000" ],
      removal_reason: [ "none" ],
      exclude_mods: [ "yes" ],
      flairs: [ "any" ],
      top_level_only: [ "no" ],
      is_enabled: [ "enabled" ],
    };
    expect(JSON.stringify(parseFormValues(reordered, "t3_abc")))
      .toBe(JSON.stringify(parseFormValues(BASE, "t3_abc")));
  });
});
