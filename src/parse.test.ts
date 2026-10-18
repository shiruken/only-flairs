import { describe, expect, test } from "vitest";
import { parseFormValues } from "./parse.js";

// Values as submitted by the form, with the default exemptions selected
const BASE = {
  flairs: [ "any" ],
  exemptions: [ "mods", "author" ],
  removal_reason: [ "none" ],
  expiration: [ "2592000" ],
};

describe("parseFormValues", () => {
  test("parses a typical enable submission", () => {
    expect(parseFormValues(BASE, "t3_abc")).toEqual({
      post_id: "t3_abc",
      is_enabled: true,
      flairs: [ "any" ],
      top_level_only: false,
      exclude_mods: true,
      exclude_author: true,
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

  test("always enables", () => {
    expect(parseFormValues({ ...BASE, is_enabled: false }, "t3_abc").is_enabled).toBe(true);
  });

  test("maps each exemption to its setting", () => {
    expect(parseFormValues({ ...BASE, exemptions: [ "replies" ] }, "t3_abc")).toMatchObject({
      top_level_only: true,
      exclude_mods: false,
      exclude_author: false,
    });
    expect(parseFormValues({ ...BASE, exemptions: [ "mods", "author", "replies" ] }, "t3_abc")).toMatchObject({
      top_level_only: true,
      exclude_mods: true,
      exclude_author: true,
    });
  });

  test("treats empty or omitted exemptions as none", () => {
    const none = { top_level_only: false, exclude_mods: false, exclude_author: false };
    expect(parseFormValues({ ...BASE, exemptions: [] }, "t3_abc")).toMatchObject(none);
    const { exemptions: _omitted, ...without } = BASE;
    expect(parseFormValues(without, "t3_abc")).toMatchObject(none);
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

  test("handles non-array or omitted flairs, removal_reason, and expiration", () => {
    const values = {
      flairs: undefined,
      removal_reason: undefined,
      expiration: undefined,
      exemptions: [ "mods" ],
    };
    const settings = parseFormValues(values as any, "t3_abc");
    expect(settings.flairs).toEqual([ "any" ]);
    expect(settings.removal_reason).toBe("none");
    expect(settings.expiration).toBe(0);
  });

  test("handles scalar expiration value", () => {
    const values = {
      ...BASE,
      expiration: 86400,
    };
    const settings = parseFormValues(values as any, "t3_abc");
    expect(settings.expiration).toBe(86400);
  });

  test("sorts flairs alphabetically for deterministic order", () => {
    const values = {
      ...BASE,
      flairs: ["flair_z", "flair_a", "flair_m"],
    };
    const settings = parseFormValues(values, "t3_abc");
    expect(settings.flairs).toEqual(["flair_a", "flair_m", "flair_z"]);
  });

  test("produces identical JSON regardless of submitted key order", () => {
    // Change detection in processForm compares JSON strings
    const reordered = {
      expiration: [ "2592000" ],
      removal_reason: [ "none" ],
      exemptions: [ "author", "mods" ],
      flairs: [ "any" ],
    };
    expect(JSON.stringify(parseFormValues(reordered, "t3_abc")))
      .toBe(JSON.stringify(parseFormValues(BASE, "t3_abc")));
  });
});

