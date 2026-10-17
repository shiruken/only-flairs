import { describe, expect, test } from "vitest";
import { hasAllowedFlair } from "./flair.js";

describe("hasAllowedFlair", () => {
  test("rejects missing flair", () => {
    expect(hasAllowedFlair(undefined, [ "any" ])).toBe(false);
  });

  test("rejects empty flair", () => {
    expect(hasAllowedFlair({ text: "", templateId: "" }, [ "any" ])).toBe(false);
    expect(hasAllowedFlair({}, [ "any" ])).toBe(false);
  });

  test("accepts any flair when 'any' is allowed", () => {
    expect(hasAllowedFlair({ text: "Biology", templateId: "t1" }, [ "any" ])).toBe(true);
  });

  test("accepts free-text flair without a template when 'any' is allowed", () => {
    expect(hasAllowedFlair({ text: "Custom", templateId: "" }, [ "any" ])).toBe(true);
  });

  test("accepts listed template", () => {
    expect(hasAllowedFlair({ text: "Biology", templateId: "t1" }, [ "t1", "t2" ])).toBe(true);
  });

  test("rejects unlisted template", () => {
    expect(hasAllowedFlair({ text: "Physics", templateId: "t3" }, [ "t1", "t2" ])).toBe(false);
  });

  test("rejects free-text flair when specific templates are required", () => {
    expect(hasAllowedFlair({ text: "Custom", templateId: "" }, [ "t1" ])).toBe(false);
  });
});
