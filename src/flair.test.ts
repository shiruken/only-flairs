import { describe, expect, test } from "vitest";
import { formatFlair, hasAllowedFlair } from "./flair.js";

describe("formatFlair", () => {
  test("formats undefined flair as 'none'", () => {
    expect(formatFlair(undefined)).toBe("none");
  });

  test("formats flair with both text and templateId", () => {
    expect(formatFlair({ text: "Biology", templateId: "t1" })).toBe('text="Biology", templateId="t1"');
  });

  test("formats flair with missing text or templateId as empty string", () => {
    expect(formatFlair({ text: "Biology" })).toBe('text="Biology", templateId=""');
    expect(formatFlair({ templateId: "t1" })).toBe('text="", templateId="t1"');
    expect(formatFlair({})).toBe('text="", templateId=""');
  });
});

describe("hasAllowedFlair", () => {
  test("rejects missing flair", () => {
    expect(hasAllowedFlair(undefined, [ "any" ])).toBe(false);
  });

  test("rejects empty flair", () => {
    expect(hasAllowedFlair({ text: "", templateId: "" }, [ "any" ])).toBe(false);
    expect(hasAllowedFlair({}, [ "any" ])).toBe(false);
  });

  test("rejects whitespace-only flair", () => {
    expect(hasAllowedFlair({ text: "   ", templateId: "   " }, [ "any" ])).toBe(false);
    expect(hasAllowedFlair({ text: "   " }, [ "any" ])).toBe(false);
    expect(hasAllowedFlair({ templateId: "   " }, [ "any" ])).toBe(false);
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

  test("accepts listed template with whitespace surrounding templateId", () => {
    expect(hasAllowedFlair({ text: "Biology", templateId: "  t1  " }, [ "t1", "t2" ])).toBe(true);
  });

  test("rejects unlisted template", () => {
    expect(hasAllowedFlair({ text: "Physics", templateId: "t3" }, [ "t1", "t2" ])).toBe(false);
  });

  test("rejects free-text flair when specific templates are required", () => {
    expect(hasAllowedFlair({ text: "Custom", templateId: "" }, [ "t1" ])).toBe(false);
  });
});
