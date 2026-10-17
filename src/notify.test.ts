import { describe, expect, it, vi } from "vitest";
import { notifyMods } from "./form.js";
import type { Context, Post } from "@devvit/public-api";

describe("notifyMods", () => {
  const mockPost = {
    id: "t3_test123",
    subredditId: "t5_sub123",
  } as unknown as Post;

  it("creates a new mod notification when conversation_id is undefined", async () => {
    const createModNotification = vi.fn().mockResolvedValue("conv_new_123");
    const reply = vi.fn();
    const mockContext = {
      reddit: {
        modMail: {
          createModNotification,
          reply,
        },
      },
    } as unknown as Context;

    const result = await notifyMods(mockContext, mockPost, undefined, {
      subject: "Test Subject",
      body: "Test Body",
    });

    expect(createModNotification).toHaveBeenCalledWith({
      subredditId: "t5_sub123",
      subject: "Test Subject",
      bodyMarkdown: "Test Body",
    });
    expect(reply).not.toHaveBeenCalled();
    expect(result).toBe("conv_new_123");
  });

  it("replies with isInternal: true when conversation_id is provided", async () => {
    const createModNotification = vi.fn();
    const reply = vi.fn().mockResolvedValue({ conversation: {}, user: {} });
    const mockContext = {
      reddit: {
        modMail: {
          createModNotification,
          reply,
        },
      },
    } as unknown as Context;

    const result = await notifyMods(mockContext, mockPost, "conv_existing_456", {
      subject: "Edit Subject",
      body: "Edit Body",
    });

    expect(reply).toHaveBeenCalledWith({
      conversationId: "conv_existing_456",
      body: "Edit Body",
      isInternal: true,
    });
    expect(createModNotification).not.toHaveBeenCalled();
    expect(result).toBe("conv_existing_456");
  });

  it("falls back to createModNotification if reply fails", async () => {
    const createModNotification = vi.fn().mockResolvedValue("conv_fallback_789");
    const reply = vi.fn().mockRejectedValue(new Error("Conversation is read-only"));
    const mockContext = {
      reddit: {
        modMail: {
          createModNotification,
          reply,
        },
      },
    } as unknown as Context;

    const result = await notifyMods(mockContext, mockPost, "conv_broken_456", {
      subject: "Fallback Subject",
      body: "Fallback Body",
    });

    expect(reply).toHaveBeenCalledWith({
      conversationId: "conv_broken_456",
      body: "Fallback Body",
      isInternal: true,
    });
    expect(createModNotification).toHaveBeenCalledWith({
      subredditId: "t5_sub123",
      subject: "Fallback Subject",
      bodyMarkdown: "Fallback Body",
    });
    expect(result).toBe("conv_fallback_789");
  });

  it("does not throw if both reply and createModNotification fail", async () => {
    const createModNotification = vi.fn().mockRejectedValue(new Error("Network failure"));
    const reply = vi.fn().mockRejectedValue(new Error("Reply failure"));
    const mockContext = {
      reddit: {
        modMail: {
          createModNotification,
          reply,
        },
      },
    } as unknown as Context;

    const result = await notifyMods(mockContext, mockPost, "conv_fail_999", {
      subject: "Subject",
      body: "Body",
    });

    expect(result).toBe("conv_fail_999");
  });
});

