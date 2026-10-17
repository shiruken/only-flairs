import { describe, expect, it, vi, beforeEach } from "vitest";
import { createFormConfig, processForm, quoteText } from "./form.js";
import type { Context, FormOnSubmitEvent, JSONObject } from "@devvit/public-api";
import type { PostSettings } from "./types.js";

describe("form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("quoteText", () => {
    it("formats a single line into quoted reddit markdown", () => {
      expect(quoteText("Hello world")).toBe("\n >Hello world");
    });

    it("formats multiple lines into blockquoted markdown", () => {
      expect(quoteText("Line 1\nLine 2\nLine 3")).toBe("\n >Line 1\n> Line 2\n> Line 3");
    });
  });

  describe("createFormConfig", () => {
    const mockFlairTemplates = [
      { id: "flair_1", text: "Verified Member" },
      { id: "flair_2", text: "Contributor" },
    ];
    const mockRemovalReasons = [
      { id: "reason_1", title: "Off-topic" },
      { id: "reason_2", title: "Spam" },
    ];

    it("generates form with default values when post has no previous settings", () => {
      const data = {
        flairs: JSON.stringify(mockFlairTemplates),
        removal_reasons: mockRemovalReasons,
        sticky_comment_text_default: "Default sticky placeholder %%flair%%",
      };

      const config = createFormConfig(data);

      expect(config.title).toBe("Restrict to Flaired Users");
      expect(config.acceptLabel).toBe("Save");

      const fields = config.fields;
      const isEnabledField = fields.find((f: any) => f.name === "is_enabled");
      const flairsField = fields.find((f: any) => f.name === "flairs");
      const topLevelField = fields.find((f: any) => f.name === "top_level_only");
      const excludeModsField = fields.find((f: any) => f.name === "exclude_mods");
      const removalReasonField = fields.find((f: any) => f.name === "removal_reason");
      const stickyCommentField = fields.find((f: any) => f.name === "sticky_comment_text");
      const expirationField = fields.find((f: any) => f.name === "expiration");

      expect(isEnabledField?.defaultValue).toBe(true);
      expect(flairsField?.defaultValue).toEqual(["any"]);
      expect(flairsField?.options).toEqual([
        { label: "Any", value: "any" },
        { label: "Verified Member", value: "flair_1" },
        { label: "Contributor", value: "flair_2" },
      ]);
      expect(topLevelField?.defaultValue).toBe(false);
      expect(excludeModsField?.defaultValue).toBe(true);
      expect(removalReasonField?.defaultValue).toEqual(["none"]);
      expect(removalReasonField?.options).toEqual([
        { label: "None", value: "none" },
        { label: "Off-topic", value: "reason_1" },
        { label: "Spam", value: "reason_2" },
      ]);
      expect(stickyCommentField?.defaultValue).toBe("Default sticky placeholder %%flair%%");
      expect(expirationField?.defaultValue).toEqual(["2592000"]);
    });

    it("populates default values from existing post settings", () => {
      const existingSettings: PostSettings = {
        post_id: "t3_post123",
        is_enabled: false,
        flairs: ["flair_1"],
        top_level_only: true,
        exclude_mods: false,
        removal_reason: "reason_1",
        sticky_comment_text: "Custom sticky comment",
        expiration: 3600,
      };

      const data = {
        settings: existingSettings,
        flairs: mockFlairTemplates,
        removal_reasons: mockRemovalReasons,
        sticky_comment_text_default: "Default",
      };

      const config = createFormConfig(data);
      const fields = config.fields;

      expect(fields.find((f: any) => f.name === "is_enabled")?.defaultValue).toBe(false);
      expect(fields.find((f: any) => f.name === "flairs")?.defaultValue).toEqual(["flair_1"]);
      expect(fields.find((f: any) => f.name === "top_level_only")?.defaultValue).toBe(true);
      expect(fields.find((f: any) => f.name === "exclude_mods")?.defaultValue).toBe(false);
      expect(fields.find((f: any) => f.name === "removal_reason")?.defaultValue).toEqual(["reason_1"]);
      expect(fields.find((f: any) => f.name === "sticky_comment_text")?.defaultValue).toBe("Custom sticky comment");
      expect(fields.find((f: any) => f.name === "expiration")?.defaultValue).toEqual(["3600"]);
    });
  });

  describe("processForm", () => {
    function setupProcessFormContext(options?: {
      postId?: string;
      initialSettings?: PostSettings;
      flairTemplates?: Array<{ id: string; text: string }>;
      removalReasons?: Array<{ id: string; title: string }>;
    }) {
      const redisStore: Record<string, string> = {};
      const targetPostId = options && "postId" in options ? options.postId : "t3_post123";
      if (options?.initialSettings && targetPostId) {
        redisStore[targetPostId] = JSON.stringify(options.initialSettings);
      }

      const showToast = vi.fn();
      const mockComment = {
        id: "t1_sticky999",
        distinguish: vi.fn().mockResolvedValue(undefined),
        edit: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      };

      const mockContext = {
        postId: targetPostId,
        ui: {
          showToast,
        },
        redis: {
          get: vi.fn().mockImplementation(async (key: string) => redisStore[key] ?? null),
          set: vi.fn().mockImplementation(async (key: string, val: string) => {
            redisStore[key] = val;
          }),
          del: vi.fn().mockImplementation(async (key: string) => {
            delete redisStore[key];
          }),
          expire: vi.fn().mockResolvedValue(1),
        },
        reddit: {
          getCurrentUser: vi.fn().mockResolvedValue({ username: "mod_colin" }),
          getPostById: vi.fn().mockResolvedValue({
            id: targetPostId ?? "t3_post123",
            title: "Discussion Thread",
            permalink: "/r/sub/comments/post123",
            subredditName: "testsub",
            subredditId: "t5_testsub",
          }),
          getUserFlairTemplates: vi.fn().mockResolvedValue(
            options?.flairTemplates ?? [
              { id: "flair_1", text: "VIP" },
              { id: "flair_2", text: "Approved" },
            ]
          ),
          getSubredditRemovalReasons: vi.fn().mockResolvedValue(
            options?.removalReasons ?? [
              { id: "reason_rules", title: "Violates Rules" },
            ]
          ),
          submitComment: vi.fn().mockResolvedValue(mockComment),
          getCommentById: vi.fn().mockResolvedValue(mockComment),
          modMail: {
            createModNotification: vi.fn().mockResolvedValue("conv_modmail_123"),
            reply: vi.fn().mockResolvedValue({ conversation: {}, user: {} }),
          },
        },
      } as unknown as Context;

      return { mockContext, showToast, mockComment, redisStore };
    }

    it("throws error when postId is missing from context", async () => {
      const { mockContext } = setupProcessFormContext({ postId: undefined as any });
      const event = { values: {} } as FormOnSubmitEvent<JSONObject>;

      await expect(processForm(event, mockContext)).rejects.toThrow(
        "postId missing from context object"
      );
    });

    describe("enabling restrictions for the first time", () => {
      it("enables flaired user mode, submits sticky comment, sends ModMail and saves to Redis", async () => {
        const { mockContext, showToast, mockComment, redisStore } = setupProcessFormContext();

        const formValues = {
          is_enabled: true,
          flairs: ["flair_1"],
          top_level_only: false,
          exclude_mods: true,
          removal_reason: ["reason_rules"],
          sticky_comment_text: "Comments restricted to: %%flair%%",
          expiration: ["2592000"],
        };

        await processForm({ values: formValues } as FormOnSubmitEvent<JSONObject>, mockContext);

        expect(mockContext.reddit.submitComment).toHaveBeenCalledWith({
          id: "t3_post123",
          text: "Comments restricted to: `VIP`",
        });
        expect(mockComment.distinguish).toHaveBeenCalledWith(true);

        expect(mockContext.reddit.modMail.createModNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            subredditId: "t5_testsub",
            subject: "Flaired User Only Mode Enabled",
            bodyMarkdown: expect.stringContaining("* **User Flairs:** `VIP`"),
          })
        );

        const savedSettings: PostSettings = JSON.parse(redisStore["t3_post123"]);
        expect(savedSettings.is_enabled).toBe(true);
        expect(savedSettings.sticky_comment_id).toBe("t1_sticky999");
        expect(savedSettings.conversation_id).toBe("conv_modmail_123");

        expect(showToast).toHaveBeenCalledWith({
          text: "Commenting restricted to flaired users",
          appearance: "success",
        });
      });

      it("handles multiple flairs and 'any' flair formatting in ModMail and sticky comment", async () => {
        const { mockContext } = setupProcessFormContext();

        const formValues = {
          is_enabled: true,
          flairs: ["any"],
          top_level_only: true,
          exclude_mods: false,
          removal_reason: ["none"],
          sticky_comment_text: "Allowed flairs: %%flair%%",
          expiration: ["0"],
        };

        await processForm({ values: formValues } as FormOnSubmitEvent<JSONObject>, mockContext);

        expect(mockContext.reddit.submitComment).toHaveBeenCalledWith({
          id: "t3_post123",
          text: "Allowed flairs: Any",
        });
        expect(mockContext.reddit.modMail.createModNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            bodyMarkdown: expect.stringContaining("* **User Flairs:** Any"),
          })
        );
      });

      it("does not submit sticky comment if sticky_comment_text is empty", async () => {
        const { mockContext, showToast } = setupProcessFormContext();

        const formValues = {
          is_enabled: true,
          flairs: ["any"],
          top_level_only: false,
          exclude_mods: true,
          removal_reason: ["none"],
          sticky_comment_text: "",
          expiration: ["0"],
        };

        await processForm({ values: formValues } as FormOnSubmitEvent<JSONObject>, mockContext);

        expect(mockContext.reddit.submitComment).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith({
          text: "Commenting restricted to flaired users",
          appearance: "success",
        });
      });

      it("catches sticky comment creation error without throwing", async () => {
        const { mockContext, showToast } = setupProcessFormContext();
        (mockContext.reddit.submitComment as any).mockRejectedValue(new Error("API rate limited"));

        const formValues = {
          is_enabled: true,
          flairs: ["any"],
          top_level_only: false,
          exclude_mods: true,
          removal_reason: ["none"],
          sticky_comment_text: "Sticky note",
          expiration: ["0"],
        };

        await expect(
          processForm({ values: formValues } as FormOnSubmitEvent<JSONObject>, mockContext)
        ).resolves.toBeUndefined();

        expect(showToast).toHaveBeenCalledWith({
          text: "Commenting restricted to flaired users",
          appearance: "success",
        });
      });
    });

    describe("editing existing restrictions", () => {
      const oldSettings: PostSettings = {
        post_id: "t3_post123",
        is_enabled: true,
        flairs: ["flair_1"],
        top_level_only: false,
        exclude_mods: true,
        expiration: 3600,
        removal_reason: "none",
        sticky_comment_text: "Original sticky text %%flair%%",
        conversation_id: "conv_existing_123",
        sticky_comment_id: "t1_sticky999",
      };

      it("edits sticky comment and sends follow-up ModMail when settings are changed", async () => {
        const { mockContext, showToast, mockComment } = setupProcessFormContext({
          initialSettings: oldSettings,
        });

        const updatedValues = {
          is_enabled: true,
          flairs: ["flair_1", "flair_2"],
          top_level_only: true, // changed
          exclude_mods: true,
          removal_reason: ["none"],
          sticky_comment_text: "Updated sticky text %%flair%%", // changed
          expiration: ["3600"],
        };

        await processForm({ values: updatedValues } as FormOnSubmitEvent<JSONObject>, mockContext);

        expect(mockComment.edit).toHaveBeenCalledWith({
          text: "Updated sticky text `VIP`, `Approved`",
        });
        expect(mockContext.reddit.modMail.reply).toHaveBeenCalledWith(
          expect.objectContaining({
            conversationId: "conv_existing_123",
            isInternal: true,
          })
        );
        expect(showToast).toHaveBeenCalledWith({
          text: "Commenting restrictions updated",
          appearance: "success",
        });
      });

      it("deletes sticky comment when sticky comment text is removed during edit", async () => {
        const { mockContext, showToast, mockComment, redisStore } = setupProcessFormContext({
          initialSettings: oldSettings,
        });

        const updatedValues = {
          is_enabled: true,
          flairs: ["flair_1"],
          top_level_only: false,
          exclude_mods: true,
          removal_reason: ["none"],
          sticky_comment_text: "", // cleared
          expiration: ["3600"],
        };

        await processForm({ values: updatedValues } as FormOnSubmitEvent<JSONObject>, mockContext);

        expect(mockComment.delete).toHaveBeenCalled();
        const saved = JSON.parse(redisStore["t3_post123"]);
        expect(saved.sticky_comment_id).toBeUndefined();
        expect(showToast).toHaveBeenCalledWith({
          text: "Commenting restrictions updated",
          appearance: "success",
        });
      });

      it("creates a new sticky comment if old settings had none", async () => {
        const settingsWithoutSticky: PostSettings = {
          ...oldSettings,
          sticky_comment_id: undefined,
          sticky_comment_text: "",
        };
        const { mockContext, showToast, mockComment, redisStore } = setupProcessFormContext({
          initialSettings: settingsWithoutSticky,
        });

        const updatedValues = {
          is_enabled: true,
          flairs: ["flair_1"],
          top_level_only: false,
          exclude_mods: true,
          removal_reason: ["none"],
          sticky_comment_text: "New sticky comment",
          expiration: ["3600"],
        };

        await processForm({ values: updatedValues } as FormOnSubmitEvent<JSONObject>, mockContext);

        expect(mockContext.reddit.submitComment).toHaveBeenCalledWith({
          id: "t3_post123",
          text: "New sticky comment",
        });
        expect(mockComment.distinguish).toHaveBeenCalledWith(true);

        const saved = JSON.parse(redisStore["t3_post123"]);
        expect(saved.sticky_comment_id).toBe("t1_sticky999");
        expect(showToast).toHaveBeenCalledWith({
          text: "Commenting restrictions updated",
          appearance: "success",
        });
      });

      it("displays neutral toast and makes no updates when submitted form has no changes", async () => {
        const { mockContext, showToast, mockComment } = setupProcessFormContext({
          initialSettings: oldSettings,
        });

        // Exact match to oldSettings
        const identicalValues = {
          is_enabled: true,
          flairs: ["flair_1"],
          top_level_only: false,
          exclude_mods: true,
          removal_reason: ["none"],
          sticky_comment_text: "Original sticky text %%flair%%",
          expiration: ["3600"],
        };

        await processForm({ values: identicalValues } as FormOnSubmitEvent<JSONObject>, mockContext);

        expect(mockComment.edit).not.toHaveBeenCalled();
        expect(mockContext.reddit.modMail.reply).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith({
          text: "No changes to commenting restrictions",
          appearance: "neutral",
        });
      });

      it("catches sticky comment update error during edit without throwing", async () => {
        const { mockContext, showToast, mockComment } = setupProcessFormContext({
          initialSettings: oldSettings,
        });
        mockComment.edit.mockRejectedValue(new Error("Comment edit API error"));

        const updatedValues = {
          is_enabled: true,
          flairs: ["flair_1"],
          top_level_only: true, // change
          exclude_mods: true,
          removal_reason: ["none"],
          sticky_comment_text: "Changed comment text",
          expiration: ["3600"],
        };

        await expect(
          processForm({ values: updatedValues } as FormOnSubmitEvent<JSONObject>, mockContext)
        ).resolves.toBeUndefined();

        expect(showToast).toHaveBeenCalledWith({
          text: "Commenting restrictions updated",
          appearance: "success",
        });
      });
    });

    describe("disabling restrictions", () => {
      it("disables restrictions, deletes sticky comment, sends ModMail and clears Redis", async () => {
        const existingSettings: PostSettings = {
          post_id: "t3_post123",
          is_enabled: true,
          flairs: ["any"],
          top_level_only: false,
          exclude_mods: true,
          removal_reason: "none",
          sticky_comment_text: "Sticky note",
          sticky_comment_id: "t1_sticky999",
          conversation_id: "conv_existing_123",
          expiration: 3600,
        };

        const { mockContext, showToast, mockComment, redisStore } = setupProcessFormContext({
          initialSettings: existingSettings,
        });

        const disableValues = {
          is_enabled: false,
          flairs: ["any"],
          top_level_only: false,
          exclude_mods: true,
          removal_reason: ["none"],
          sticky_comment_text: "",
          expiration: ["0"],
        };

        await processForm({ values: disableValues } as FormOnSubmitEvent<JSONObject>, mockContext);

        expect(mockComment.delete).toHaveBeenCalled();
        expect(mockContext.reddit.modMail.reply).toHaveBeenCalledWith(
          expect.objectContaining({
            conversationId: "conv_existing_123",
            body: expect.stringContaining("disabled flaired user only mode"),
          })
        );
        expect(redisStore["t3_post123"]).toBeUndefined();
        expect(showToast).toHaveBeenCalledWith({
          text: "Commenting permitted from all users",
          appearance: "success",
        });
      });

      it("shows neutral toast when disabling a post that was never enabled", async () => {
        const { mockContext, showToast } = setupProcessFormContext();

        const disableValues = {
          is_enabled: false,
          flairs: ["any"],
          top_level_only: false,
          exclude_mods: true,
          removal_reason: ["none"],
          sticky_comment_text: "",
          expiration: ["0"],
        };

        await processForm({ values: disableValues } as FormOnSubmitEvent<JSONObject>, mockContext);

        expect(showToast).toHaveBeenCalledWith({
          text: "Commenting restriction not applied. Did you forget to enable Flaired Only mode?",
          appearance: "neutral",
        });
        expect(mockContext.reddit.modMail.reply).not.toHaveBeenCalled();
      });

      it("catches sticky comment deletion error when disabling without throwing", async () => {
        const existingSettings: PostSettings = {
          post_id: "t3_post123",
          is_enabled: true,
          flairs: ["any"],
          top_level_only: false,
          exclude_mods: true,
          removal_reason: "none",
          sticky_comment_text: "Sticky note",
          sticky_comment_id: "t1_sticky999",
          conversation_id: "conv_existing_123",
          expiration: 3600,
        };

        const { mockContext, showToast, mockComment } = setupProcessFormContext({
          initialSettings: existingSettings,
        });
        mockComment.delete.mockRejectedValue(new Error("Reddit delete API error"));

        const disableValues = {
          is_enabled: false,
          flairs: ["any"],
          top_level_only: false,
          exclude_mods: true,
          removal_reason: ["none"],
          sticky_comment_text: "",
          expiration: ["0"],
        };

        await expect(
          processForm({ values: disableValues } as FormOnSubmitEvent<JSONObject>, mockContext)
        ).resolves.toBeUndefined();

        expect(showToast).toHaveBeenCalledWith({
          text: "Commenting permitted from all users",
          appearance: "success",
        });
      });
    });
  });
});


