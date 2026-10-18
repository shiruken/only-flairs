import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelExpiration,
  EXPIRE_JOB_NAME,
  onExpireRestrictions,
  scheduleExpiration,
} from "./scheduler.js";
import type { Context, JobContext, ScheduledJobEvent } from "@devvit/public-api";
import type { PostSettings } from "./types.js";

describe("scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("scheduleExpiration", () => {
    it("schedules expiration job with calculated runAt and returns jobId", async () => {
      const runJob = vi.fn().mockResolvedValue("job_abc_123");
      const mockContext = {
        scheduler: { runJob },
      } as unknown as Context;

      const before = Date.now();
      const jobId = await scheduleExpiration("t3_post123", 3600, mockContext);
      const after = Date.now();

      expect(jobId).toBe("job_abc_123");
      expect(runJob).toHaveBeenCalledTimes(1);
      const callArg = runJob.mock.calls[0][0];
      expect(callArg.name).toBe(EXPIRE_JOB_NAME);
      expect(callArg.data).toEqual({ postId: "t3_post123" });
      const runAtTime = callArg.runAt.getTime();
      expect(runAtTime).toBeGreaterThanOrEqual(before + 3600 * 1000);
      expect(runAtTime).toBeLessThanOrEqual(after + 3600 * 1000);
    });

    it("catches scheduler error and returns undefined without throwing", async () => {
      const runJob = vi.fn().mockRejectedValue(new Error("Scheduler unavailable"));
      const mockContext = {
        scheduler: { runJob },
      } as unknown as Context;

      const jobId = await scheduleExpiration("t3_post123", 3600, mockContext);
      expect(jobId).toBeUndefined();
    });
  });

  describe("cancelExpiration", () => {
    it("cancels scheduled job by ID", async () => {
      const cancelJob = vi.fn().mockResolvedValue(undefined);
      const mockContext = {
        scheduler: { cancelJob },
      } as unknown as Context;

      await cancelExpiration("job_xyz_789", mockContext);
      expect(cancelJob).toHaveBeenCalledWith("job_xyz_789");
    });

    it("catches cancellation error without throwing", async () => {
      const cancelJob = vi.fn().mockRejectedValue(new Error("Job not found"));
      const mockContext = {
        scheduler: { cancelJob },
      } as unknown as Context;

      await expect(cancelExpiration("job_missing", mockContext)).resolves.toBeUndefined();
    });
  });

  describe("onExpireRestrictions", () => {
    const mockPostSettings: PostSettings = {
      post_id: "t3_post123",
      is_enabled: true,
      flairs: ["any"],
      top_level_only: false,
      exclude_mods: true,
      expiration: 3600,
      removal_reason: "none",
      sticky_comment_text: "Restricted",
      sticky_comment_id: "t1_sticky999",
      conversation_id: "conv_modmail_123",
      scheduler_job_id: "job_active",
    };

    function setupJobContext(settings?: PostSettings) {
      const redisStore: Record<string, string> = {};
      if (settings) {
        redisStore[settings.post_id] = JSON.stringify(settings);
      }

      const mockComment = {
        id: "t1_sticky999",
        delete: vi.fn().mockResolvedValue(undefined),
      };

      const mockPost = {
        id: "t3_post123",
        title: "Test Discussion",
        permalink: "/r/test/comments/post123",
        subredditId: "t5_sub123",
      };

      const reply = vi.fn().mockResolvedValue({ conversation: {}, user: {} });
      const createModNotification = vi.fn().mockResolvedValue("conv_new_123");

      const mockContext = {
        redis: {
          get: vi.fn().mockImplementation(async (key: string) => redisStore[key] ?? null),
          del: vi.fn().mockImplementation(async (key: string) => {
            delete redisStore[key];
          }),
        },
        reddit: {
          getCommentById: vi.fn().mockResolvedValue(mockComment),
          getPostById: vi.fn().mockResolvedValue(mockPost),
          modMail: {
            reply,
            createModNotification,
          },
        },
      } as unknown as JobContext;

      return { mockContext, mockComment, mockPost, reply, createModNotification, redisStore };
    }

    it("does nothing if post settings are not found in Redis", async () => {
      const { mockContext, mockComment } = setupJobContext(undefined);
      const event = {
        name: EXPIRE_JOB_NAME,
        data: { postId: "t3_post123" },
      } as ScheduledJobEvent<{ postId: string }>;

      await onExpireRestrictions(event, mockContext);

      expect(mockComment.delete).not.toHaveBeenCalled();
      expect(mockContext.redis.del).not.toHaveBeenCalled();
    });

    it("does nothing if post restriction is already disabled", async () => {
      const { mockContext, mockComment } = setupJobContext({
        ...mockPostSettings,
        is_enabled: false,
      });
      const event = {
        name: EXPIRE_JOB_NAME,
        data: { postId: "t3_post123" },
      } as ScheduledJobEvent<{ postId: string }>;

      await onExpireRestrictions(event, mockContext);

      expect(mockComment.delete).not.toHaveBeenCalled();
      expect(mockContext.redis.del).not.toHaveBeenCalled();
    });

    it("deletes sticky comment, sends ModMail notification and deletes post from Redis", async () => {
      const { mockContext, mockComment, reply, redisStore } = setupJobContext(mockPostSettings);
      const event = {
        name: EXPIRE_JOB_NAME,
        data: { postId: "t3_post123" },
      } as ScheduledJobEvent<{ postId: string }>;

      await onExpireRestrictions(event, mockContext);

      expect(mockComment.delete).toHaveBeenCalledTimes(1);
      expect(mockContext.reddit.getPostById).toHaveBeenCalledWith("t3_post123");
      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conv_modmail_123",
          body: expect.stringContaining("have expired"),
          isInternal: true,
        })
      );
      expect(redisStore["t3_post123"]).toBeUndefined();
    });

    it("does not attempt comment deletion if post settings have no sticky_comment_id", async () => {
      const settingsWithoutSticky: PostSettings = {
        ...mockPostSettings,
        sticky_comment_id: undefined,
      };
      const { mockContext, mockComment, reply } = setupJobContext(settingsWithoutSticky);
      const event = {
        name: EXPIRE_JOB_NAME,
        data: { postId: "t3_post123" },
      } as ScheduledJobEvent<{ postId: string }>;

      await onExpireRestrictions(event, mockContext);

      expect(mockComment.delete).not.toHaveBeenCalled();
      expect(reply).toHaveBeenCalled();
      expect(mockContext.redis.del).toHaveBeenCalledWith("t3_post123");
    });

    it("continues and clears Redis even if sticky comment deletion fails", async () => {
      const { mockContext, mockComment, redisStore } = setupJobContext(mockPostSettings);
      mockComment.delete.mockRejectedValue(new Error("Comment already deleted"));

      const event = {
        name: EXPIRE_JOB_NAME,
        data: { postId: "t3_post123" },
      } as ScheduledJobEvent<{ postId: string }>;

      await expect(onExpireRestrictions(event, mockContext)).resolves.toBeUndefined();
      expect(redisStore["t3_post123"]).toBeUndefined();
    });

    it("continues and clears Redis even if post lookup / ModMail notification fails", async () => {
      const { mockContext, redisStore } = setupJobContext(mockPostSettings);
      (mockContext.reddit.getPostById as any).mockRejectedValue(new Error("Post was deleted"));

      const event = {
        name: EXPIRE_JOB_NAME,
        data: { postId: "t3_post123" },
      } as ScheduledJobEvent<{ postId: string }>;

      await expect(onExpireRestrictions(event, mockContext)).resolves.toBeUndefined();
      expect(redisStore["t3_post123"]).toBeUndefined();
    });

    it("catches Redis deletion error without throwing", async () => {
      const { mockContext } = setupJobContext(mockPostSettings);
      (mockContext.redis.del as any).mockRejectedValue(new Error("Redis del error"));

      const event = {
        name: EXPIRE_JOB_NAME,
        data: { postId: "t3_post123" },
      } as ScheduledJobEvent<{ postId: string }>;

      await expect(onExpireRestrictions(event, mockContext)).resolves.toBeUndefined();
    });

    it("skips ModMail notification if post has been removed by a moderator", async () => {
      const { mockContext, mockPost, reply, redisStore } = setupJobContext(mockPostSettings);
      (mockPost as any).removed = true;

      const event = {
        name: EXPIRE_JOB_NAME,
        data: { postId: "t3_post123" },
      } as ScheduledJobEvent<{ postId: string }>;

      await onExpireRestrictions(event, mockContext);

      expect(reply).not.toHaveBeenCalled();
      expect(redisStore["t3_post123"]).toBeUndefined();
    });

    it("skips ModMail notification if post was marked as spam", async () => {
      const { mockContext, mockPost, reply, redisStore } = setupJobContext(mockPostSettings);
      (mockPost as any).spam = true;

      const event = {
        name: EXPIRE_JOB_NAME,
        data: { postId: "t3_post123" },
      } as ScheduledJobEvent<{ postId: string }>;

      await onExpireRestrictions(event, mockContext);

      expect(reply).not.toHaveBeenCalled();
      expect(redisStore["t3_post123"]).toBeUndefined();
    });

    it("skips ModMail notification if post author was deleted", async () => {
      const { mockContext, mockPost, reply, redisStore } = setupJobContext(mockPostSettings);
      (mockPost as any).authorName = "[deleted]";

      const event = {
        name: EXPIRE_JOB_NAME,
        data: { postId: "t3_post123" },
      } as ScheduledJobEvent<{ postId: string }>;

      await onExpireRestrictions(event, mockContext);

      expect(reply).not.toHaveBeenCalled();
      expect(redisStore["t3_post123"]).toBeUndefined();
    });
  });
});


