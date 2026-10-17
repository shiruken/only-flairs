import { Context, Devvit, FlairTemplate, FormOnSubmitEvent, JSONObject, Post, RemovalReason } from "@devvit/public-api";
import { FieldConfig_Selection_Item } from '@devvit/protos';
import { PostSettings } from "./types.js";
import { clearPostSettings, getPostSettings, storePostSettings } from "./storage.js";
import { DISABLED, ENABLED, NO, parseFormValues, YES } from "./parse.js";

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
 * Post restriction settings form
 */
export const form = Devvit.createForm((data) => {
  
  // Generate options for `flairs` field
  const flair_options: FieldConfig_Selection_Item[] = [
    { label: "Any", value: "any" }
  ];
  data.flairs = JSON.parse(data.flairs);
  for (const flair of data.flairs as FlairTemplate[]) {
    flair_options.push({
      label: flair.text,
      value: flair.id,
    });
  }

  // Generate options for `removal_reason` field
  const removal_reason_options: FieldConfig_Selection_Item[] = [
    { label: "None", value: "none" }
  ];
  for (const reason of data.removal_reasons as RemovalReason[]) {
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

  // On/off fields use selects because boolean fields are unreliable on mobile
  const enable_options: FieldConfig_Selection_Item[] = [
    { label: "Enabled", value: ENABLED },
    { label: "Disabled", value: DISABLED },
  ];
  const yes_no_options: FieldConfig_Selection_Item[] = [
    { label: "Yes", value: YES },
    { label: "No", value: NO },
  ];

  return {
    title: "Restrict to Flaired Users",
    description: "Restrict commenting on this post to only flaired users",
    acceptLabel: "Save",
    fields: [
      {
        name: "is_enabled",
        label: "Enable",
        helpText: "Enable or disable flaired user only mode",
        type: "select",
        required: true,
        multiSelect: false,
        options: enable_options,
        defaultValue: [ (!settings || settings.is_enabled) ? ENABLED : DISABLED ],
      },
      {
        name: "flairs",
        label: "User Flairs",
        helpText: "Only allow comments from users with the selected flair(s)",
        type: "select",
        required: true,
        multiSelect: true,
        options: flair_options,
        defaultValue: settings ? settings.flairs : [ "any" ],
      },
      {
        name: "top_level_only",
        label: "Only Restrict Top-Level Comments",
        helpText: "Allow comment replies from any user regardless of flair",
        type: "select",
        required: true,
        multiSelect: false,
        options: yes_no_options,
        defaultValue: [ (settings && settings.top_level_only) ? YES : NO ],
      },
      {
        name: "exclude_mods",
        label: "Exclude Moderators",
        helpText: "Exclude subreddit moderators from comment restrictions",
        type: "select",
        required: true,
        multiSelect: false,
        options: yes_no_options,
        defaultValue: [ (!settings || settings.exclude_mods) ? YES : NO ],
      },
      {
        name: "removal_reason",
        label: "Removal Reason",
        helpText: "Subreddit removal reason to use on actioned comments",
        type: "select",
        required: true,
        multiSelect: false,
        options: removal_reason_options,
        defaultValue: [ (settings && settings.removal_reason) ? settings.removal_reason : "none" ],
      },
      {
        name: "sticky_comment_text",
        label: "Sticky Comment",
        helpText: "Post sticky comment with above text. Use the placeholder %%flair%% to include a list of the selected flairs. Leave empty to disable. Set default value in app settings.",
        type: "paragraph",
        defaultValue: settings ? settings.sticky_comment_text : data.sticky_comment_text_default,
      },
      {
        name: "expiration",
        label: "Expiration",
        helpText: "Automatically disable after selected duration",
        type: "select",
        required: true,
        multiSelect: false,
        options: expiration_options,
        defaultValue: [ settings ? settings.expiration.toString() : expiration_default.toString() ],
      },
    ],
  };
}, processForm);

/**
 * Process post restriction form after user submission
 * @param event A FormOnSubmitEvent object
 * @param context A Context object
 */
async function processForm(event: FormOnSubmitEvent<JSONObject>, context: Context): Promise<void> {

  // Log raw submission for diagnosing form issues
  console.log(`Form values on ${context.postId}: ${JSON.stringify(event.values)}`);

  if (!context.postId) {
    throw new Error("postId missing from context object");
  }
  const settings = parseFormValues(event.values, context.postId);

  // Load previous post settings
  // Could pass through form data from showPostRestrictForm() handler but starts getting messy
  const settings_old = await getPostSettings(settings.post_id, context);

  const mod = (await context.reddit.getCurrentUser())!;
  const post = await context.reddit.getPostById(settings.post_id);

  if (settings.is_enabled) {

    // Format flair titles for display
    let user_flairs_text = "Any";
    if (!settings.flairs.includes("any")) {
      const flairs = await context.reddit.getUserFlairTemplates(post.subredditName);
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
      const reasons = await context.reddit.getSubredditRemovalReasons(post.subredditName);
      for (const reason of reasons) {
        if (settings.removal_reason == reason.id) {
          removal_reason_text = "`" + reason.title + "`";
          break;
        }
      }
    }

    if (settings_old) { // Edit

      // Propagate to new settings
      settings.sticky_comment_id = settings_old.sticky_comment_id;

      if (JSON.stringify(settings) !== JSON.stringify(settings_old)) { // Has Changes
        console.log(`u/${mod.username} edited flaired user only mode on ${settings.post_id}`);

        // Send ModMail
        await notifyMods(context, post, {
          subject: `Flaired User Only Mode Edited`,
          body: `u/${mod.username} has edited flaired user only mode on ` +
                `[${post.title}](${post.permalink}).\n\n` + 
                `**Updated Configuration**\n\n` +
                `* **User Flairs:** ${user_flairs_text}\n\n` +
                `* **Only Restrict Top-Level Comments:** ${settings.top_level_only}\n\n` +
                `* **Exclude Moderators:** ${settings.exclude_mods}\n\n` +
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
          console.error(`Error updating sticky comment on ${settings.post_id}`, e);
        }

        await storePostSettings(settings, context);
        context.ui.showToast({
          text: "Commenting restrictions updated",
          appearance: "success",
        });
      } else { // No Change
        context.ui.showToast({
          text: "No changes to commenting restrictions",
          appearance: "neutral",
        });
      }
    } else { // Enable
      console.log(`u/${mod.username} enabled flaired user only mode on ${settings.post_id}`);

      // Send ModMail
      await notifyMods(context, post, {
        subject: `Flaired User Only Mode Enabled`,
        body: `u/${mod.username} has enabled flaired user only mode on ` +
              `[${post.title}](${post.permalink}).\n\n` + 
              `**Configuration**\n\n` +
              `* **User Flairs:** ${user_flairs_text}\n\n` +
              `* **Only Restrict Top-Level Comments:** ${settings.top_level_only}\n\n` +
              `* **Exclude Moderators:** ${settings.exclude_mods}\n\n` +
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
          console.error(`Error posting sticky comment on ${settings.post_id}`, e);
        }
      }

      await storePostSettings(settings, context);
      context.ui.showToast({
        text: "Commenting restricted to flaired users",
        appearance: "success",
      });
    }
  } else {
    if (settings_old) { // Disable
      console.log(`u/${mod.username} disabled flaired user only mode on ${settings.post_id}`);

      // Send ModMail
      await notifyMods(context, post, {
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
          console.error(`Error deleting sticky comment ${settings_old.sticky_comment_id}`, e);
        }
      }

      await clearPostSettings(settings.post_id, context);
      context.ui.showToast({
        text: "Commenting permitted from all users",
        appearance: "success",
      });  
    } else { // Never Enabled
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
 * Starts a new conversation for every message because Reddit makes
 * app-created conversations read-only, so replies are rejected.
 * @param context A Context object
 * @param post The restricted post
 * @param message Subject and body of the message
 */
async function notifyMods(context: Context, post: Post, message: { subject: string, body: string }): Promise<void> {
  try {
    await context.reddit.modMail.createModInboxConversation({
      subredditId: post.subredditId,
      subject: message.subject,
      bodyMarkdown: message.body,
    });
  } catch (e) {
    console.error(`Error sending ModMail for ${post.id}`, e);
  }
}

/**
 * Format string as quoted text in Reddit Markdown
 * @param text A string to format as quoted text
 * @returns A string containing quoted text
 */
function quoteText(text: string): string {
  return "\n >" + text.replace(/\n/g, "\n> ");
}
