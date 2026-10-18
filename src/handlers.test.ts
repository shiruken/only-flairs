import { describe, expect, it, vi, beforeEach } from "vitest";
import { checkComment, onAppChanged, onModAction, showPostRestrictForm } from "./handlers.js";
import { form } from "./form.js";
import type { Comment, Context, MenuItemOnPressEvent, TriggerContext } from "@devvit/public-api";
import type { CommentSubmit, ModAction } from "@devvit/protos";
import type { PostSettings } from "./types.js";

describe("handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("showPostRestrictForm", () => {
    const mockPostSettings: PostSettings = {
      post_id: "t3_post123",
      is_enabled: true,
      flairs: ["flair_abc"],
      top_level_only: false,
      exclude_mods: true,
      expiration: 86400,
      removal_reason: "reason_xyz",
      sticky_comment_text: "Restricted to flaired users",
    };

    it("fetches post settings, flairs, removal reasons and shows form", async () => {
      const showForm = vi.fn();
      const mockContext = {
        reddit: {
          getCurrentSubredditName: vi.fn().mockResolvedValue("testsubreddit"),
          getUserFlairTemplates: vi.fn().mockResolvedValue([{ id: "flair_abc", text: "Verified" }]),
          getSubredditRemovalReasons: vi.fn().mockResolvedValue([{ id: "reason_xyz", title: "No flair" }]),
        },
        settings: {
          get: vi.fn().mockResolvedValue("Default sticky text"),
        },
        redis: {
          get: vi.fn().mockResolvedValue(JSON.stringify(mockPostSettings)),
        },
        ui: {
          showForm,
        },
      } as unknown as Context;

      const event = {
        targetId: "t3_post123",
      } as MenuItemOnPressEvent;

      await showPostRestrictForm(event, mockContext);

      expect(mockContext.reddit.getCurrentSubredditName).toHaveBeenCalled();
      expect(mockContext.redis.get).toHaveBeenCalledWith("t3_post123");
      expect(mockContext.settings.get).toHaveBeenCalledWith("sticky_comment_text_default");
      expect(mockContext.reddit.getUserFlairTemplates).toHaveBeenCalledWith("testsubreddit");
      expect(mockContext.reddit.getSubredditRemovalReasons).toHaveBeenCalledWith("testsubreddit");
      expect(showForm).toHaveBeenCalledWith(form, {
        settings: mockPostSettings,
        sticky_comment_text_default: "Default sticky text",
        flairs: JSON.stringify([{ id: "flair_abc", text: "Verified" }]),
        removal_reasons: [{ id: "reason_xyz", title: "No flair" }],
      });
    });

    it("defaults missing settings and sticky text default to empty string", async () => {
      const showForm = vi.fn();
      const mockContext = {
        reddit: {
          getCurrentSubredditName: vi.fn().mockResolvedValue("testsubreddit"),
          getUserFlairTemplates: vi.fn().mockResolvedValue([]),
          getSubredditRemovalReasons: vi.fn().mockResolvedValue([]),
        },
        settings: {
          get: vi.fn().mockResolvedValue(undefined),
        },
        redis: {
          get: vi.fn().mockResolvedValue(null),
        },
        ui: {
          showForm,
        },
      } as unknown as Context;

      const event = {
        targetId: "t3_newpost",
      } as MenuItemOnPressEvent;

      await showPostRestrictForm(event, mockContext);

      expect(showForm).toHaveBeenCalledWith(form, {
        settings: "",
        sticky_comment_text_default: "",
        flairs: "[]",
        removal_reasons: [],
      });
    });

    it("treats expired post settings as undefined when opening form", async () => {
      const showForm = vi.fn();
      const expiredSettings: PostSettings = {
        ...mockPostSettings,
        expires_at: Date.now() - 60000, // Expired 1 minute ago
      };
      const mockContext = {
        reddit: {
          getCurrentSubredditName: vi.fn().mockResolvedValue("testsubreddit"),
          getUserFlairTemplates: vi.fn().mockResolvedValue([]),
          getSubredditRemovalReasons: vi.fn().mockResolvedValue([]),
        },
        settings: {
          get: vi.fn().mockResolvedValue(undefined),
        },
        redis: {
          get: vi.fn().mockResolvedValue(JSON.stringify(expiredSettings)),
        },
        ui: {
          showForm,
        },
      } as unknown as Context;

      const event = {
        targetId: "t3_post123",
      } as MenuItemOnPressEvent;

      await showPostRestrictForm(event, mockContext);

      expect(showForm).toHaveBeenCalledWith(form, {
        settings: "",
        sticky_comment_text_default: "",
        flairs: "[]",
        removal_reasons: [],
      });
    });
  });

  describe("checkComment", () => {
    const baseSettings: PostSettings = {
      post_id: "t3_post100",
      is_enabled: true,
      flairs: ["flair_allowed"],
      top_level_only: false,
      exclude_mods: true,
      expiration: 0,
      removal_reason: "reason_not_flaired",
      sticky_comment_text: "",
    };

    function setupCommentContext(options?: {
      settings?: PostSettings;
      cachedMods?: string | null;
      appSlug?: string;
      commentRemoveMock?: any;
      commentAddRemovalNoteMock?: any;
      apiAuthorFlair?: { text?: string; templateId?: string };
    }) {
      const redisStore: Record<string, string> = {};
      if (options?.settings) {
        redisStore[options.settings.post_id] = JSON.stringify(options.settings);
      }
      if (options?.cachedMods !== undefined) {
        if (options.cachedMods !== null) {
          redisStore["$mods"] = options.cachedMods;
        }
      } else {
        redisStore["$mods"] = "mod_user,head_mod";
      }

      const remove = options?.commentRemoveMock ?? vi.fn().mockResolvedValue(undefined);
      const addRemovalNote = options?.commentAddRemovalNoteMock ?? vi.fn().mockResolvedValue(undefined);

      const mockCommentAPI = {
        id: "t1_comm100",
        authorFlair: options?.apiAuthorFlair,
        remove,
        addRemovalNote,
      } as unknown as Comment;

      const mockContext = {
        appSlug: options?.appSlug ?? "only-flairs",
        redis: {
          get: vi.fn().mockImplementation(async (key: string) => redisStore[key] ?? null),
          set: vi.fn().mockImplementation(async (key: string, val: string) => {
            redisStore[key] = val;
          }),
          expire: vi.fn().mockResolvedValue(1),
        },
        reddit: {
          getCommentById: vi.fn().mockResolvedValue(mockCommentAPI),
          getCurrentSubreddit: vi.fn().mockResolvedValue({
            name: "testsubreddit",
            getModerators: vi.fn().mockImplementation(() => {
              return (async function* () {
                yield { username: "refreshed_mod1" };
                yield { username: "refreshed_mod2" };
              })();
            }),
          }),
        },
      } as unknown as TriggerContext;

      return { mockContext, mockCommentAPI, remove, addRemovalNote, redisStore };
    }

    it("throws error when comment object is missing from event", async () => {
      const { mockContext } = setupCommentContext();
      await expect(
        checkComment({} as CommentSubmit, mockContext)
      ).rejects.toThrow("Comment object missing from event data");
    });

    it("throws error when author object is missing from event", async () => {
      const { mockContext } = setupCommentContext();
      const event = {
        comment: { id: "t1_c1", postId: "t3_post100", parentId: "t3_post100" },
      } as CommentSubmit;
      await expect(checkComment(event, mockContext)).rejects.toThrow(
        "Author object missing from event data"
      );
    });

    it("skips comments authored by the app itself", async () => {
      const { mockContext, remove } = setupCommentContext({ appSlug: "only-flairs" });
      const event = {
        comment: { id: "t1_c1", postId: "t3_post100", parentId: "t3_post100" },
        author: { name: "only-flairs" },
      } as CommentSubmit;

      await checkComment(event, mockContext);

      expect(mockContext.redis.get).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it("skips comments when post is not restricted (no settings in Redis)", async () => {
      const { mockContext, remove } = setupCommentContext({ settings: undefined });
      const event = {
        comment: { id: "t1_c1", postId: "t3_unrestricted", parentId: "t3_unrestricted" },
        author: { name: "regular_user", flair: { text: "No Flair", templateId: "none" } },
      } as CommentSubmit;

      await checkComment(event, mockContext);

      expect(remove).not.toHaveBeenCalled();
    });

    it("skips comment replies when top_level_only is true", async () => {
      const settings: PostSettings = {
        ...baseSettings,
        top_level_only: true,
      };
      const { mockContext, remove } = setupCommentContext({ settings });
      const event = {
        comment: { id: "t1_reply", postId: "t3_post100", parentId: "t1_parent_comment" },
        author: { name: "regular_user", flair: { text: "No Flair", templateId: "none" } },
      } as CommentSubmit;

      await checkComment(event, mockContext);

      expect(remove).not.toHaveBeenCalled();
    });

    it("skips comments when restrictions have expired (expires_at has passed)", async () => {
      const settings: PostSettings = {
        ...baseSettings,
        expires_at: Date.now() - 5000,
      };
      const { mockContext, remove } = setupCommentContext({ settings });
      const event = {
        comment: { id: "t1_c1", postId: "t3_post100", parentId: "t3_post100" },
        author: { name: "regular_user", flair: { text: "No Flair", templateId: "none" } },
      } as CommentSubmit;

      await checkComment(event, mockContext);

      expect(remove).not.toHaveBeenCalled();
    });

    it("does not skip top-level comments when top_level_only is true", async () => {
      const settings: PostSettings = {
        ...baseSettings,
        top_level_only: true,
      };
      const { mockContext, remove } = setupCommentContext({ settings });
      const event = {
        comment: { id: "t1_top", postId: "t3_post100", parentId: "t3_post100" },
        author: { name: "regular_user", flair: { text: "Wrong Flair", templateId: "wrong" } },
      } as CommentSubmit;

      await checkComment(event, mockContext);

      expect(remove).toHaveBeenCalled();
    });

    describe("moderator exclusions", () => {
      it("skips comments from cached moderators when exclude_mods is true", async () => {
        const { mockContext, remove } = setupCommentContext({
          settings: baseSettings,
          cachedMods: "mod_user,head_mod",
        });
        const event = {
          comment: { id: "t1_c1", postId: "t3_post100", parentId: "t3_post100" },
          author: { name: "mod_user", flair: undefined },
        } as CommentSubmit;

        await checkComment(event, mockContext);

        expect(remove).not.toHaveBeenCalled();
      });

      it("skips comments from moderators with case-insensitive username matching", async () => {
        const { mockContext, remove } = setupCommentContext({
          settings: baseSettings,
          cachedMods: "Head_Mod,Mod_User",
        });
        const event = {
          comment: { id: "t1_c1", postId: "t3_post100", parentId: "t3_post100" },
          author: { name: "mod_user", flair: undefined },
        } as CommentSubmit;

        await checkComment(event, mockContext);

        expect(remove).not.toHaveBeenCalled();
      });

      it("refreshes moderators when cache is empty and skips refreshed moderator", async () => {
        const { mockContext, remove, redisStore } = setupCommentContext({
          settings: baseSettings,
          cachedMods: null, // empty cache
        });
        const event = {
          comment: { id: "t1_c1", postId: "t3_post100", parentId: "t3_post100" },
          author: { name: "refreshed_mod1", flair: undefined },
        } as CommentSubmit;

        await checkComment(event, mockContext);

        expect(mockContext.reddit.getCurrentSubreddit).toHaveBeenCalled();
        expect(redisStore["$mods"]).toBe("refreshed_mod1,refreshed_mod2");
        expect(remove).not.toHaveBeenCalled();
      });

      it("continues flair check when cache refresh fails", async () => {
        const { mockContext, remove } = setupCommentContext({
          settings: baseSettings,
          cachedMods: null,
        });
        (mockContext.reddit.getCurrentSubreddit as any).mockRejectedValue(new Error("Reddit API down"));

        const event = {
          comment: { id: "t1_c1", postId: "t3_post100", parentId: "t3_post100" },
          author: { name: "some_user", flair: { templateId: "wrong_flair", text: "text" } },
        } as CommentSubmit;

        await checkComment(event, mockContext);

        // Does not throw, but proceeds to remove since flair is invalid
        expect(remove).toHaveBeenCalled();
      });

      it("does not exclude moderators when exclude_mods is false", async () => {
        const settings: PostSettings = {
          ...baseSettings,
          exclude_mods: false,
        };
        const { mockContext, remove } = setupCommentContext({
          settings,
          cachedMods: "mod_user",
        });
        const event = {
          comment: { id: "t1_c1", postId: "t3_post100", parentId: "t3_post100" },
          author: { name: "mod_user", flair: { templateId: "wrong_flair", text: "text" } },
        } as CommentSubmit;

        await checkComment(event, mockContext);

        expect(remove).toHaveBeenCalled();
      });
    });

    describe("flair checking & removal", () => {
      it("allows comment when author has allowed flair in event payload", async () => {
        const { mockContext, remove } = setupCommentContext({ settings: baseSettings });
        const event = {
          comment: { id: "t1_c1", postId: "t3_post100", parentId: "t3_post100" },
          author: { name: "regular_user", flair: { templateId: "flair_allowed", text: "Allowed" } },
        } as CommentSubmit;

        await checkComment(event, mockContext);

        expect(remove).not.toHaveBeenCalled();
        expect(mockContext.reddit.getCommentById).not.toHaveBeenCalled();
      });

      it("fetches comment from API when author flair is missing from event", async () => {
        const { mockContext, remove } = setupCommentContext({
          settings: baseSettings,
          apiAuthorFlair: { templateId: "flair_allowed", text: "Allowed" },
        });
        const event = {
          comment: { id: "t1_c1", postId: "t3_post100", parentId: "t3_post100" },
          author: { name: "regular_user", flair: undefined },
        } as CommentSubmit;

        await checkComment(event, mockContext);

        expect(mockContext.reddit.getCommentById).toHaveBeenCalledWith("t1_c1");
        expect(remove).not.toHaveBeenCalled();
      });

      it("fetches comment from API when author flair has empty text and templateId", async () => {
        const { mockContext, remove } = setupCommentContext({
          settings: baseSettings,
          apiAuthorFlair: { templateId: "flair_allowed", text: "Allowed" },
        });
        const event = {
          comment: { id: "t1_c1", postId: "t3_post100", parentId: "t3_post100" },
          author: { name: "regular_user", flair: { text: "", templateId: "" } },
        } as CommentSubmit;

        await checkComment(event, mockContext);

        expect(mockContext.reddit.getCommentById).toHaveBeenCalledWith("t1_c1");
        expect(remove).not.toHaveBeenCalled();
      });

      it("removes comment when author flair is disallowed and sets removal note", async () => {
        const { mockContext, remove, addRemovalNote } = setupCommentContext({
          settings: baseSettings,
        });
        const event = {
          comment: { id: "t1_c1", postId: "t3_post100", parentId: "t3_post100" },
          author: { name: "unflaired_user", flair: { templateId: "other_flair", text: "Other" } },
        } as CommentSubmit;

        await checkComment(event, mockContext);

        expect(remove).toHaveBeenCalledTimes(1);
        expect(addRemovalNote).toHaveBeenCalledWith({
          reasonId: "reason_not_flaired",
          modNote: "Commenting restricted to flaired users on t3_post100",
        });
      });

      it("passes empty string as reasonId when removal_reason is 'none'", async () => {
        const settings: PostSettings = {
          ...baseSettings,
          removal_reason: "none",
        };
        const { mockContext, remove, addRemovalNote } = setupCommentContext({ settings });
        const event = {
          comment: { id: "t1_c1", postId: "t3_post100", parentId: "t3_post100" },
          author: { name: "unflaired_user", flair: undefined },
        } as CommentSubmit;

        await checkComment(event, mockContext);

        expect(remove).toHaveBeenCalled();
        expect(addRemovalNote).toHaveBeenCalledWith({
          reasonId: "",
          modNote: "Commenting restricted to flaired users on t3_post100",
        });
      });

      it("retries removal once if first attempt fails", async () => {
        vi.useFakeTimers();
        try {
          const remove = vi
            .fn()
            .mockRejectedValueOnce(new Error("Network glitch"))
            .mockResolvedValueOnce(undefined);
          const addRemovalNote = vi.fn().mockResolvedValue(undefined);

          const { mockContext } = setupCommentContext({
            settings: baseSettings,
            commentRemoveMock: remove,
            commentAddRemovalNoteMock: addRemovalNote,
          });

          const event = {
            comment: { id: "t1_c1", postId: "t3_post100", parentId: "t3_post100" },
            author: { name: "unflaired_user", flair: undefined },
          } as CommentSubmit;

          const promise = checkComment(event, mockContext);
          await vi.advanceTimersByTimeAsync(1000);
          await promise;

          expect(remove).toHaveBeenCalledTimes(2);
          expect(addRemovalNote).toHaveBeenCalledTimes(1);
        } finally {
          vi.useRealTimers();
        }
      });

      it("does not call addRemovalNote if all removal attempts fail", async () => {
        vi.useFakeTimers();
        try {
          const remove = vi.fn().mockRejectedValue(new Error("Permanent API failure"));
          const addRemovalNote = vi.fn();

          const { mockContext } = setupCommentContext({
            settings: baseSettings,
            commentRemoveMock: remove,
            commentAddRemovalNoteMock: addRemovalNote,
          });

          const event = {
            comment: { id: "t1_c1", postId: "t3_post100", parentId: "t3_post100" },
            author: { name: "unflaired_user", flair: undefined },
          } as CommentSubmit;

          const promise = checkComment(event, mockContext);
          await vi.advanceTimersByTimeAsync(1000);
          await promise;

          expect(remove).toHaveBeenCalledTimes(2);
          expect(addRemovalNote).not.toHaveBeenCalled();
        } finally {
          vi.useRealTimers();
        }
      });

      it("does not throw if addRemovalNote fails", async () => {
        const remove = vi.fn().mockResolvedValue(undefined);
        const addRemovalNote = vi.fn().mockRejectedValue(new Error("Removal note API error"));

        const { mockContext } = setupCommentContext({
          settings: baseSettings,
          commentRemoveMock: remove,
          commentAddRemovalNoteMock: addRemovalNote,
        });

        const event = {
          comment: { id: "t1_c1", postId: "t3_post100", parentId: "t3_post100" },
          author: { name: "unflaired_user", flair: undefined },
        } as CommentSubmit;

        await expect(checkComment(event, mockContext)).resolves.toBeUndefined();
        expect(remove).toHaveBeenCalled();
        expect(addRemovalNote).toHaveBeenCalled();
      });
    });
  });

  describe("onAppChanged", () => {
    it("refreshes moderators and stores them in Redis on app install or upgrade", async () => {
      const set = vi.fn().mockResolvedValue("OK");
      const expire = vi.fn().mockResolvedValue(1);
      const mockContext = {
        redis: { set, expire },
        reddit: {
          getCurrentSubreddit: vi.fn().mockResolvedValue({
            name: "testsubreddit",
            getModerators: vi.fn().mockImplementation(() => {
              return (async function* () {
                yield { username: "mod_alpha" };
                yield { username: "mod_beta" };
              })();
            }),
          }),
        },
      } as unknown as TriggerContext;

      await onAppChanged({} as any, mockContext);

      expect(set).toHaveBeenCalledWith("$mods", "mod_alpha,mod_beta");
      expect(expire).toHaveBeenCalledWith("$mods", expect.any(Number));
    });

    it("throws error if fetching modlist fails", async () => {
      const mockContext = {
        redis: { set: vi.fn() },
        reddit: {
          getCurrentSubreddit: vi.fn().mockResolvedValue({
            name: "testsubreddit",
            getModerators: vi.fn().mockImplementation(() => {
              return (async function* () {
                throw new Error("API rate limited");
              })();
            }),
          }),
        },
      } as unknown as TriggerContext;

      await expect(onAppChanged({} as any, mockContext)).rejects.toThrow(
        "Error fetching modlist for r/testsubreddit"
      );
    });

    it("throws error if fetched modlist is empty", async () => {
      const mockContext = {
        redis: { set: vi.fn() },
        reddit: {
          getCurrentSubreddit: vi.fn().mockResolvedValue({
            name: "testsubreddit",
            getModerators: vi.fn().mockImplementation(() => {
              return (async function* () {})();
            }),
          }),
        },
      } as unknown as TriggerContext;

      await expect(onAppChanged({} as any, mockContext)).rejects.toThrow(
        "Fetched modlist for r/testsubreddit is empty, skipping cache update"
      );
    });
  });

  describe("onModAction", () => {
    it("throws error if action is missing from event", async () => {
      const mockContext = {} as TriggerContext;
      await expect(onModAction({} as ModAction, mockContext)).rejects.toThrow(
        "Missing action in onModAction"
      );
    });

    it.each([
      "acceptmoderatorinvite",
      "addmoderator",
      "removemoderator",
      "reordermoderators",
    ])("refreshes moderators on mod action '%s'", async (action) => {
      const set = vi.fn().mockResolvedValue("OK");
      const expire = vi.fn().mockResolvedValue(1);
      const mockContext = {
        redis: { set, expire },
        reddit: {
          getCurrentSubreddit: vi.fn().mockResolvedValue({
            name: "testsubreddit",
            getModerators: vi.fn().mockImplementation(() => {
              return (async function* () {
                yield { username: "active_mod" };
              })();
            }),
          }),
        },
      } as unknown as TriggerContext;

      await onModAction({ action } as ModAction, mockContext);

      expect(set).toHaveBeenCalledWith("$mods", "active_mod");
      expect(expire).toHaveBeenCalledWith("$mods", expect.any(Number));
    });

    it("ignores unrelated mod actions", async () => {
      const set = vi.fn();
      const mockContext = {
        redis: { set },
        reddit: {
          getCurrentSubreddit: vi.fn(),
        },
      } as unknown as TriggerContext;

      await onModAction({ action: "banuser" } as ModAction, mockContext);

      expect(set).not.toHaveBeenCalled();
      expect(mockContext.reddit.getCurrentSubreddit).not.toHaveBeenCalled();
    });
  });
});
