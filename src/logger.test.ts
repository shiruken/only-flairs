import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, logger } from "./logger.js";

describe("logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prefixes debug logs and calls console.debug", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const customLogger = createLogger("comment");

    customLogger.debug("test debug message", { extra: 1 });
    expect(debugSpy).toHaveBeenCalledWith("[comment] test debug message", { extra: 1 });
  });

  it("prefixes info logs and calls console.log", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const customLogger = createLogger("form");

    customLogger.info("test info message");
    expect(logSpy).toHaveBeenCalledWith("[form] test info message");
  });

  it("prefixes warn logs and calls console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const customLogger = createLogger("scheduler");

    customLogger.warn("test warn message");
    expect(warnSpy).toHaveBeenCalledWith("[scheduler] test warn message");
  });

  it("prefixes error logs and calls console.error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const customLogger = createLogger("storage");

    const err = new Error("db failure");
    customLogger.error("test error message", err);
    expect(errorSpy).toHaveBeenCalledWith("[storage] test error message", err);
  });

  it("provides pre-configured loggers for all domains", () => {
    expect(logger.comment).toBeDefined();
    expect(logger.form).toBeDefined();
    expect(logger.scheduler).toBeDefined();
    expect(logger.modlist).toBeDefined();
    expect(logger.storage).toBeDefined();
  });
});

