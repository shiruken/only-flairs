import { Context, Devvit, FlairTemplate, FormOnSubmitEvent, JobContext, JSONObject, Post, RemovalReason } from "@devvit/public-api";
import { FieldConfig_Selection_Item } from '@devvit/protos';
import { PostSettings } from "./types.js";
import { clearPostSettings, getPostSettings, storePostSettings } from "./storage.js";
import { parseFormValues } from "./parse.js";
import { cancelExpiration, scheduleExpiration } from "./scheduler.js";
import { logger } from "./logger.js";

// Define expiration durations (in seconds) and associated labels
const DURATIONS: Record<number, string> = {
  0: "Never",
  3600: "1 hour",
  7200: "2 hours",
  14400: "4 hours",
  21600: "6 hours",
  43200: "12 hours",
  86400: "1 day",
  172800: "2 days",
  259200: "3 days",
  604800: "7 days",
  1209600: "14 days",
  2592000: "30 days", // Default
};

/**
 * Generates the post restriction settings form configuration
 */
export function createFormConfig(data: any) {
  // Generate options for `flairs` field
  const flair_options: FieldConfig_Selection_Item[] = [
    { label: "Any", value: "any" }
  ];
  const parsedFlairs = typeof data.flairs === "string" ? JSON.parse(data.flairs) : data.flairs;
  for (const flair of (parsedFlairs ?? []) as FlairTemplate[]) {
    flair_options.push({
      label: flair.text,
      value: flair.id,
    });
  }

  // Generate options for `removal_reason` field
  const removal_reason_options: FieldConfig_Selection_Item[] = [
    { label: "None", value: "none" }
  ];
  for (const reason of (data.removal_reasons ?? []) as RemovalReason[]) {
    removal_reason_options.push({
      label: reason.title,
      value: reason.id,
    });
  }

  // Generate options for `expiration` field
  const settings: PostSettings | undefined = data.settings;
  const expiration_options: FieldConfig_Selection_Item[] = Object.entries(DURATIONS)
    .map(([key, value]) => {
      return { label: value, value: key };
    });
  const expiration_default = Object.keys(DURATIONS).slice(-1); // 30 days

  return {
    title: "Restrict to Flaired Users",
    description: "Restrict commenting on this post to only flaired users",
    acceptLabel: "Save",
    fields: [
      {
        name: "is_enabled",
        label: "Enable",
        helpText: "Enable or disable flaired user only mode",
        type: "boolean" as const,
        defaultValue: !settings || settings.is_enabled,
      },
      {
        name: "flairs",
        label: "User Flairs",
        helpText: "Only allow comments from users with the selected flair(s)",
        type: "select" as const,
        required: true,
        multiSelect: true,
        options: flair_options,
        defaultValue: settings ? settings.flairs : [ "any" ],
      },
      {
        name: "top_level_only",
        label: "Only Restrict Top-Level Comments",
        helpText: "Allow comment replies from any user regardless of flair",
        type: "boolean" as const,
        defaultValue: settings ? settings.top_level_only : false,
      },
      {
        name: "exclude_mods",
        label: "Exclude Moderators",
        helpText: "Exclude subreddit moderators from comment restrictions",
        type: "boolean" as const,
        defaultValue: !settings || settings.exclude_mods,
      },
      {
        name: "exclude_author",
        label: "Exclude Author",
        helpText: "Exclude post author from comment restrictions",
        type: "boolean" as const,
        defaultValue: settings?.exclude_author ?? true,
      },
      {
        name: "removal_reason",
        label: "Removal Reason",
        helpText: "Subreddit removal reason to use on actioned comments",
        type: "select" as const,
        required: true,
        multiSelect: false,
        options: removal_reason_options,
        defaultValue: [ (settings && settings.removal_reason) ? settings.removal_reason : "none" ],
      },
      {
        name: "sticky_comment_text",
        label: "Sticky Comment",
        helpText: "Post sticky comment with above text. Use the placeholder %%flair%% to include a list of the selected flairs. Leave empty to disable. Set default value in app settings.",
        type: "paragraph" as const,
        defaultValue: settings ? settings.sticky_comment_text : data.sticky_comment_text_default,
      },
      {
        name: "expiration",
        label: "Expiration",
        helpText: "Automatically disable after selected duration",
        type: "select" as const,
        required: true,
        multiSelect: false,
        options: expiration_options,
        defaultValue: [ settings ? settings.expiration.toString() : expiration_default.toString() ],
      },
    ],
  };
}

/**
 * Post restriction settings form
 */
export const form = Devvit.createForm(createFormConfig, processForm);


/**
 * Process post restriction form after user submission
 * @param event A FormOnSubmitEvent object
 * @param context A Context object
 */
export async function processForm(event: FormOnSubmitEvent<JSONObject>, context: Context): Promise<void> {

  // Log raw submission for diagnosing form issues
  logger.form.info(`Form values on ${context.postId}: ${JSON.stringify(event.values)}`);

  if (!context.postId) {
    throw new Error("postId missing from context object");
  }
  const settings = parseFormValues(event.values, context.postId);

  // Load previous post settings, moderator, and post in parallel
  const [settings_old, mod, post] = await Promise.all([
    getPostSettings(settings.post_id, context),
    context.reddit.getCurrentUser(),
    context.reddit.getPostById(settings.post_id),
  ]);

  if (!mod) {
    throw new Error("Unable to get current user");
  }

  // Guard against deleted posts
  if (post.authorName === '[deleted]' || post.removedByCategory === 'deleted') {
    if (settings_old?.is_enabled) {
      await clearPostSettings(settings.post_id, context);
      if (settings_old.scheduler_job_id) {
        await cancelExpiration(settings_old.scheduler_job_id, context);
      }
    }
    context.ui.showToast("Cannot configure restrictions on a deleted post");
    return;
  }

  settings.op_author_name = post.authorName;

  if (settings.is_enabled) {

    // Fetch flair templates and removal reasons in parallel if needed
    const flairsPromise = !settings.flairs.includes("any")
      ? context.reddit.getUserFlairTemplates(post.subredditName)
      : Promise.resolve([] as FlairTemplate[]);
    const reasonsPromise = settings.removal_reason != "none"
      ? context.reddit.getSubredditRemovalReasons(post.subredditName)
      : Promise.resolve([] as RemovalReason[]);

    const [flairs, reasons] = await Promise.all([flairsPromise, reasonsPromise]);

    // Format flair titles for display
    let user_flairs_text = "Any";
    if (!settings.flairs.includes("any")) {
      const flairs_text: string[] = [];
      for (const flair of flairs as FlairTemplate[]) {
        if (settings.flairs.includes(flair.id)) {
          flairs_text.push("`" + flair.text + "`");
        }
      }
      user_flairs_text = flairs_text.join(", ");
    }

    // Populate placeholder in sticky comment
    const sticky_comment_text = settings.sticky_comment_text.replace(/%%flair%%/g, () => user_flairs_text);

    // Format removal reason for display
    let removal_reason_text = "None";
    if (settings.removal_reason != "none") {
      for (const reason of reasons) {
        if (settings.removal_reason == reason.id) {
          removal_reason_text = "`" + reason.title + "`";
          break;
        }
      }
    }

    if (settings_old) { // Edit

      // Propagate to new settings
      settings.conversation_id = settings_old.conversation_id;
      settings.sticky_comment_id = settings_old.sticky_comment_id;
      settings.scheduler_job_id = settings_old.scheduler_job_id;
      settings.expires_at = settings_old.expires_at;

      if (hasSettingsChanged(settings, settings_old)) { // Has Changes
        logger.form.info(`u/${mod.username} edited flaired user only mode on ${settings.post_id}`);

        // Update expiration schedule if duration changed
        if (settings.expiration !== settings_old.expiration) {
          if (settings_old.scheduler_job_id) {
            await cancelExpiration(settings_old.scheduler_job_id, context);
            settings.scheduler_job_id = undefined;
          }
          if (settings.expiration > 0) {
            settings.expires_at = Date.now() + settings.expiration * 1000;
            settings.scheduler_job_id = await scheduleExpiration(settings.post_id, settings.expiration, context);
          } else {
            settings.expires_at = undefined;
          }
        }

        // Send ModMail
        settings.conversation_id = await notifyMods(context, post, settings_old.conversation_id, {
          subject: `Flaired User Only Mode Edited`,
          body: `u/${mod.username} has edited flaired user only mode on ` +
                `[${post.title}](${post.permalink}).\n\n` + 
                `**Updated Configuration**\n\n` +
                `* **User Flairs:** ${user_flairs_text}\n\n` +
                `* **Only Restrict Top-Level Comments:** ${settings.top_level_only}\n\n` +
                `* **Exclude Moderators:** ${settings.exclude_mods}\n\n` +
                `* **Exclude Author:** ${settings.exclude_author}\n\n` +
                `* **Removal Reason:** ${removal_reason_text}\n\n` +
                `* **Expiration:** ${DURATIONS[settings.expiration]}\n\n` +
                `* **Sticky Comment:** ${settings.sticky_comment_text ? quoteText(sticky_comment_text) : "None"}`,
        });

        // Sticky Comment
        try {
          if (settings.sticky_comment_id) {
            if (settings.sticky_comment_text) {
              if (
                (settings.sticky_comment_text != settings_old.sticky_comment_text) ||
                (settings.sticky_comment_text.includes("%%flair%%") && JSON.stringify(settings.flairs) != JSON.stringify(settings_old.flairs))
              ) {
                const comment = await context.reddit.getCommentById(settings.sticky_comment_id);
                await comment.edit({
                  text: sticky_comment_text,
                });
              }
            } else {
              const comment = await context.reddit.getCommentById(settings.sticky_comment_id);
              await comment.delete();
              settings.sticky_comment_id = undefined;
            }
          } else {
            if (settings.sticky_comment_text) {
              const comment = await context.reddit.submitComment({
                id: settings.post_id,
                text: sticky_comment_text,
              });
              await comment.distinguish(true); // Distinguish + Sticky
              settings.sticky_comment_id = comment.id;
            }
          }
        } catch (e) {
          logger.form.error(`Error updating sticky comment on ${settings.post_id}`, e);
        }

        try {
          await storePostSettings(settings, context);
          context.ui.showToast({
            text: "Commenting restrictions updated",
            appearance: "success",
          });
        } catch {
          context.ui.showToast({
            text: "Failed to update commenting restrictions",
            appearance: "neutral",
          });
        }
      } else { // No Change
        logger.form.info(`u/${mod.username} submitted form on ${settings.post_id} with no changes`);
        context.ui.showToast({
          text: "No changes to commenting restrictions",
          appearance: "neutral",
        });
      }
    } else { // Enable
      logger.form.info(`u/${mod.username} enabled flaired user only mode on ${settings.post_id}`);

      // Schedule expiration job if duration is configured
      if (settings.expiration > 0) {
        settings.expires_at = Date.now() + settings.expiration * 1000;
        settings.scheduler_job_id = await scheduleExpiration(settings.post_id, settings.expiration, context);
      }

      // Send ModMail
      settings.conversation_id = await notifyMods(context, post, undefined, {
        subject: `Flaired User Only Mode Enabled`,
        body: `u/${mod.username} has enabled flaired user only mode on ` +
              `[${post.title}](${post.permalink}).\n\n` + 
              `**Configuration**\n\n` +
              `* **User Flairs:** ${user_flairs_text}\n\n` +
              `* **Only Restrict Top-Level Comments:** ${settings.top_level_only}\n\n` +
              `* **Exclude Moderators:** ${settings.exclude_mods}\n\n` +
              `* **Exclude Author:** ${settings.exclude_author}\n\n` +
              `* **Removal Reason:** ${removal_reason_text}\n\n` +
              `* **Expiration:** ${DURATIONS[settings.expiration]}\n\n` +
              `* **Sticky Comment:** ${settings.sticky_comment_text ? quoteText(sticky_comment_text) : "None"}`,
      });

      // Sticky Comment
      if (settings.sticky_comment_text) {
        try {
          const comment = await context.reddit.submitComment({
            id: settings.post_id,
            text: sticky_comment_text,
          });
          await comment.distinguish(true); // Distinguish + Sticky
          settings.sticky_comment_id = comment.id;
        } catch (e) {
          logger.form.error(`Error posting sticky comment on ${settings.post_id}`, e);
        }
      }

      try {
        await storePostSettings(settings, context);
        context.ui.showToast({
          text: "Commenting restricted to flaired users",
          appearance: "success",
        });
      } catch {
        context.ui.showToast({
          text: "Failed to save commenting restrictions",
          appearance: "neutral",
        });
      }
    }
  } else {
    if (settings_old) { // Disable
      logger.form.info(`u/${mod.username} disabled flaired user only mode on ${settings.post_id}`);

      // Cancel scheduled expiration job if active
      if (settings_old.scheduler_job_id) {
        await cancelExpiration(settings_old.scheduler_job_id, context);
      }

      // Send ModMail
      await notifyMods(context, post, settings_old.conversation_id, {
        subject: `Flaired User Only Mode Disabled`,
        body: `u/${mod.username} has disabled flaired user only mode on ` +
              `[${post.title}](${post.permalink}).`,
      });

      // Delete Comment
      if (settings_old.sticky_comment_id) {
        try {
          const comment = await context.reddit.getCommentById(settings_old.sticky_comment_id);
          await comment.delete();
        } catch (e) {
          logger.form.error(`Error deleting sticky comment ${settings_old.sticky_comment_id}`, e);
        }
      }

      try {
        await clearPostSettings(settings.post_id, context);
        context.ui.showToast({
          text: "Commenting permitted from all users",
          appearance: "success",
        });
      } catch {
        context.ui.showToast({
          text: "Failed to disable commenting restrictions",
          appearance: "neutral",
        });
      }
    } else { // Never Enabled
      logger.form.info(`u/${mod.username} submitted disable on unmonitored post ${settings.post_id}`);
      context.ui.showToast({
        text: "Commenting restriction not applied. Did you forget to enable Flaired Only mode?",
        appearance: "neutral",
      });
    }
  }
}

/**
 * Notify moderators via ModMail without letting failures block the caller
 *
 * Replies to an existing conversation when possible using an internal mod note.
 * If replying fails, or if starting a new notification, uses createModNotification
 * so the conversation appears in the Modmail Notifications tab.
 * @param context A Context object
 * @param post The restricted post
 * @param conversation_id ModMail conversation ID to reply to, if any
 * @param message Subject and body of the message
 * @returns The ID of the conversation the message was sent to, or `conversation_id` if sending failed
 */
export async function notifyMods(
  context: Context | JobContext,
  post: Post,
  conversation_id: string | undefined,
  message: { subject: string, body: string },
): Promise<string | undefined> {
  if (conversation_id) {
    try {
      await context.reddit.modMail.reply({
        conversationId: conversation_id,
        body: message.body,
        isInternal: true,
      });
      return conversation_id;
    } catch (e) {
      logger.form.warn(`Unable to reply to ModMail conversation ${conversation_id}, starting a new one`, e);
    }
  }

  try {
    return await context.reddit.modMail.createModNotification({
      subredditId: post.subredditId,
      subject: message.subject,
      bodyMarkdown: message.body,
    });
  } catch (e) {
    logger.form.error(`Error sending ModMail for ${post.id}`, e);
    return conversation_id;
  }
}

/**
 * Format string as quoted text in Reddit Markdown
 * @param text A string to format as quoted text
 * @returns A string containing quoted text
 */
export function quoteText(text: string): string {
  return "\n> " + text.replace(/\n/g, "\n> ");
}

/**
 * Compare two PostSettings objects to determine if any configuration has changed
 *
 * Compares all fields present in newSettings against oldSettings, handling arrays
 * element-wise to avoid reference mismatch, and ignoring key insertion order.
 * @param newSettings Newly submitted settings
 * @param oldSettings Previously stored settings
 * @returns `true` if any setting value differs, otherwise `false`
 */
export function hasSettingsChanged(newSettings: PostSettings, oldSettings: PostSettings): boolean {
  for (const [key, newVal] of Object.entries(newSettings)) {
    const oldVal = (oldSettings as Record<string, unknown>)[key];
    if (Array.isArray(newVal) && Array.isArray(oldVal)) {
      if (newVal.length !== oldVal.length || !newVal.every((v, i) => v === oldVal[i])) {
        return true;
      }
    } else if (newVal !== oldVal) {
      return true;
    }
  }
  return false;
}
