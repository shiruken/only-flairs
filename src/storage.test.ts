import { describe, expect, it, vi } from "vitest";
import {
  clearPostSettings,
  getLastRemovalReason,
  getModerators,
  getPostSettings,
  INDEFINITE_POST_TTL_SECONDS,
  LAST_REMOVAL_REASON_KEY,
  MODERATOR_CACHE_TTL_SECONDS,
  REDIS_EXPIRATION_GRACE_SECONDS,
  storeLastRemovalReason,
  storeModerators,
  storePostSettings,
} from "./storage.js";
import type { Context, TriggerContext } from "@devvit/public-api";
import type { PostSettings } from "./types.js";

describe("storage", () => {
  const mockSettings: PostSettings = {
    post_id: "t3_test123",
    is_enabled: true,
    flairs: ["any"],
    top_level_only: false,
    exclude_mods: true,
    expiration: 3600,
    removal_reason: "none",
    sticky_comment_text: "Sticky text",
  };

  describe("storePostSettings", () => {
    it("stores settings and sets expiration when expiration > 0", async () => {
      const set = vi.fn().mockResolvedValue("OK");
      const expire = vi.fn().mockResolvedValue(1);
      const mockContext = {
        redis: { set, expire },
      } as unknown as Context;

      await storePostSettings(mockSettings, mockContext);

      expect(set).toHaveBeenCalledWith("t3_test123", JSON.stringify(mockSettings));
      expect(expire).toHaveBeenCalledWith("t3_test123", 3600 + REDIS_EXPIRATION_GRACE_SECONDS);
    });

    it("stores settings with fallback INDEFINITE_POST_TTL_SECONDS when expiration is 0", async () => {
      const set = vi.fn().mockResolvedValue("OK");
      const expire = vi.fn().mockResolvedValue(1);
      const mockContext = {
        redis: { set, expire },
      } as unknown as Context;

      await storePostSettings({ ...mockSettings, expiration: 0 }, mockContext);

      expect(set).toHaveBeenCalledWith(
        "t3_test123",
        JSON.stringify({ ...mockSettings, expiration: 0 })
      );
      expect(expire).toHaveBeenCalledWith("t3_test123", INDEFINITE_POST_TTL_SECONDS);
    });

    it("logs and rethrows redis errors", async () => {
      const set = vi.fn().mockRejectedValue(new Error("Redis set error"));
      const expire = vi.fn().mockRejectedValue(new Error("Redis expire error"));
      const mockContext = {
        redis: { set, expire },
      } as unknown as Context;

      await expect(
        storePostSettings(mockSettings, mockContext)
      ).rejects.toThrow("Redis set error");
    });
  });

  describe("getPostSettings", () => {
    it("returns parsed PostSettings if found in Redis", async () => {
      const get = vi.fn().mockResolvedValue(JSON.stringify(mockSettings));
      const mockContext = {
        redis: { get },
      } as unknown as Context;

      const result = await getPostSettings("t3_test123", mockContext);
      expect(get).toHaveBeenCalledWith("t3_test123");
      expect(result).toEqual(mockSettings);
    });

    it("returns undefined if key is not found in Redis", async () => {
      const get = vi.fn().mockResolvedValue(null);
      const mockContext = {
        redis: { get },
      } as unknown as Context;

      const result = await getPostSettings("t3_notfound", mockContext);
      expect(result).toBeUndefined();
    });
  });

  describe("clearPostSettings", () => {
    it("deletes post settings key from Redis", async () => {
      const del = vi.fn().mockResolvedValue(1);
      const mockContext = {
        redis: { del },
      } as unknown as Context;

      await clearPostSettings("t3_test123", mockContext);
      expect(del).toHaveBeenCalledWith("t3_test123");
    });

    it("logs and rethrows redis del errors", async () => {
      const del = vi.fn().mockRejectedValue(new Error("Redis del error"));
      const mockContext = {
        redis: { del },
      } as unknown as Context;

      await expect(
        clearPostSettings("t3_test123", mockContext)
      ).rejects.toThrow("Redis del error");
    });
  });

  describe("getModerators", () => {
    it("returns array of moderator usernames if found in Redis", async () => {
      const get = vi.fn().mockResolvedValue("mod1,mod2,mod3");
      const mockContext = {
        redis: { get },
      } as unknown as TriggerContext;

      const result = await getModerators(mockContext);
      expect(get).toHaveBeenCalledWith("$mods");
      expect(result).toEqual(["mod1", "mod2", "mod3"]);
    });

    it("returns undefined if $mods key is not found in Redis", async () => {
      const get = vi.fn().mockResolvedValue(null);
      const mockContext = {
        redis: { get },
      } as unknown as TriggerContext;

      const result = await getModerators(mockContext);
      expect(result).toBeUndefined();
    });
  });

  describe("storeModerators", () => {
    it("stores comma-separated moderator list in Redis and sets TTL", async () => {
      const set = vi.fn().mockResolvedValue("OK");
      const expire = vi.fn().mockResolvedValue(1);
      const mockContext = {
        redis: { set, expire },
      } as unknown as TriggerContext;

      await storeModerators(["mod1", "mod2"], mockContext);
      expect(set).toHaveBeenCalledWith("$mods", "mod1,mod2");
      expect(expire).toHaveBeenCalledWith("$mods", MODERATOR_CACHE_TTL_SECONDS);
    });

    it("catches and logs redis store error without throwing", async () => {
      const set = vi.fn().mockRejectedValue(new Error("Redis store error"));
      const expire = vi.fn().mockResolvedValue(1);
      const mockContext = {
        redis: { set, expire },
      } as unknown as TriggerContext;

      await expect(
        storeModerators(["mod1"], mockContext)
      ).resolves.toBeUndefined();
    });
  });

  describe("getLastRemovalReason", () => {
    it("returns removal reason string if found in Redis", async () => {
      const get = vi.fn().mockResolvedValue("reason_abc");
      const mockContext = {
        redis: { get },
      } as unknown as Context;

      const result = await getLastRemovalReason(mockContext);
      expect(get).toHaveBeenCalledWith(LAST_REMOVAL_REASON_KEY);
      expect(result).toBe("reason_abc");
    });

    it("returns undefined if key is not found in Redis", async () => {
      const get = vi.fn().mockResolvedValue(null);
      const mockContext = {
        redis: { get },
      } as unknown as Context;

      const result = await getLastRemovalReason(mockContext);
      expect(get).toHaveBeenCalledWith(LAST_REMOVAL_REASON_KEY);
      expect(result).toBeUndefined();
    });

    it("catches and logs redis read error, returning undefined", async () => {
      const get = vi.fn().mockRejectedValue(new Error("Redis get error"));
      const mockContext = {
        redis: { get },
      } as unknown as Context;

      const result = await getLastRemovalReason(mockContext);
      expect(result).toBeUndefined();
    });
  });

  describe("storeLastRemovalReason", () => {
    it("stores removal reason in Redis without expiration", async () => {
      const set = vi.fn().mockResolvedValue("OK");
      const mockContext = {
        redis: { set },
      } as unknown as Context;

      await storeLastRemovalReason("reason_xyz", mockContext);
      expect(set).toHaveBeenCalledWith(LAST_REMOVAL_REASON_KEY, "reason_xyz");
    });

    it("catches and logs redis store error without throwing", async () => {
      const set = vi.fn().mockRejectedValue(new Error("Redis set error"));
      const mockContext = {
        redis: { set },
      } as unknown as Context;

      await expect(
        storeLastRemovalReason("reason_xyz", mockContext)
      ).resolves.toBeUndefined();
    });
  });
});

