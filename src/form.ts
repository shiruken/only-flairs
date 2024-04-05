import { Context, Devvit, FormOnSubmitEvent, RemovalReason } from "@devvit/public-api";
import { FieldConfig_Selection_Item } from '@devvit/protos';
import { PostSettings } from "./types.js";
import { clearPostSettings, getPostSettings, storePostSettings } from "./storage.js";

// Define expiration durations (in seconds) and associated labels
const DURATIONS: Record<number, string> = {
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
  
  // Generate options for `removal_reason` field
  const removal_reason_options: FieldConfig_Selection_Item[] = [
    { label: "None", value: "" }
  ];
  for (const reason of data.removal_reasons as RemovalReason[]) {
    removal_reason_options.push({
      label: reason.title,
      value: JSON.stringify(reason),
    });
  }

  // Generate options for `expiration` field
  const settings: PostSettings | undefined = data.settings;
  const expiration_options: FieldConfig_Selection_Item[] = Object.entries(DURATIONS)
    .map(([key, value]) => {
      return { label: value, value: key };
    });
  const expiration_default = Object.keys(DURATIONS).slice(-1);

  return {
    title: "Restrict to Flaired Users",
    description: "Restrict commenting on this post to only flaired users",
    acceptLabel: "Save",
    fields: [
      {
        name: "is_enabled",
        label: "Enable",
        helpText: "Enable or disable flaired user only mode",
        type: "boolean",
        defaultValue: settings ? settings.is_enabled : false,
      },
      {
        name: "top_level_only",
        label: "Only restrict top-level comments",
        helpText: "Allow comment replies from any user regardless of flair",
        type: "boolean",
        defaultValue: settings ? settings.top_level_only : false,
      },
      {
        name: "exclude_mods",
        label: "Exclude Moderators",
        helpText: "Exclude subreddit moderators from comment restrictions",
        type: "boolean",
        defaultValue: settings ? settings.exclude_mods : true,
      },
      {
        name: "removal_reason",
        label: "Removal Reason",
        helpText: "Subreddit removal reason to use on actioned comments",
        type: "select",
        multiSelect: false,
        options: removal_reason_options,
        defaultValue: (settings && settings.removal_reason) ? [ JSON.stringify(settings.removal_reason) ] : [ "" ],
      },
      {
        name: "sticky_comment_text",
        label: "Sticky Comment",
        helpText: "Post sticky comment with above text. Leave empty to disable. Set default value in app settings.",
        type: "paragraph",
        defaultValue: settings ? settings.sticky_comment_text : data.sticky_comment_text_default,
      },
      {
        name: "expiration",
        label: "Expiration",
        helpText: "Automatically disable after selected duration",
        type: "select",
        multiSelect: false,
        options: expiration_options,
        defaultValue: settings ? [ settings.expiration.toString() ] : [ expiration_default.toString() ],
      },
      {
        name: "post_id", // Necessary to pass-through post information
        label: "Post ID",
        type: "string",
        defaultValue: data.post_id,
        disabled: true,
      },
    ],
  };
}, processForm);

/**
 * Process post restriction form after user submission
 * @param event A FormOnSubmitEvent object
 * @param context A Context object
 */
async function processForm(event: FormOnSubmitEvent, context: Context): Promise<void> {

  // Convert `select` fields from string[] type
  if (event.values.removal_reason[0]) {
    event.values.removal_reason = JSON.parse(event.values.removal_reason[0]) as RemovalReason;
  } else {
    event.values.removal_reason = undefined;
  }
  event.values.expiration = Number(event.values.expiration[0]);

  const settings = event.values as PostSettings;

  // Load current post settings
  // Could pass through form data from showPostRestrictForm() handler but starts getting messy
  const settings_old = await getPostSettings(event.values.post_id, context);

  const mod = await context.reddit.getCurrentUser();
  const post = await context.reddit.getPostById(settings.post_id);

  if (settings.is_enabled) {
    if (settings_old) { // Edit

      // Propagate to new settings
      settings.conversation_id = settings_old.conversation_id;
      settings.sticky_comment_id = settings_old.sticky_comment_id;

      if (JSON.stringify(settings) !== JSON.stringify(settings_old)) { // Has Changes
        console.log(`u/${mod.username} edited flaired user only mode on ${settings.post_id}`);

        // Send ModMail reply
        await context.reddit.modMail.reply({
          conversationId: settings_old.conversation_id!,
          body: `u/${mod.username} has edited flaired user only mode on ` +
                `[${post.title}](${post.permalink}).\n\n` + 
                `**Updated Configuration**\n\n` +
                `* **Only restrict top-level comments:** ${settings.top_level_only}\n\n` +
                `* **Exclude moderators:** ${settings.exclude_mods}\n\n` +
                `* **Removal Reason:** ${settings.removal_reason ? settings.removal_reason.title : "None" }\n\n` +
                `* **Expiration:** ${DURATIONS[settings.expiration]}\n\n` +
                `* **Sticky Comment:** ${settings.sticky_comment_text ? quoteText(settings.sticky_comment_text) : "None"}`,
        });

        // Sticky Comment
        if (settings.sticky_comment_id) {
          if (settings.sticky_comment_text) {
            if (settings.sticky_comment_text != settings_old.sticky_comment_text) {
              const comment = await context.reddit.getCommentById(settings.sticky_comment_id);
              await comment.edit({
                text: settings.sticky_comment_text,
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
              text: settings.sticky_comment_text,
            });
            await comment.distinguish(true); // Distinguish + Sticky
            settings.sticky_comment_id = comment.id;
          }
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
      const { conversation } = await context.reddit.modMail
        .createConversation({
          to: "only-flairs",
          subredditName: post.subredditName,
          subject: `Flaired User Only Mode Enabled`,
          body: `u/${mod.username} has enabled flaired user only mode on ` +
                `[${post.title}](${post.permalink}).\n\n` + 
                `**Configuration**\n\n` +
                `* **Only restrict top-level comments:** ${settings.top_level_only}\n\n` +
                `* **Exclude moderators:** ${settings.exclude_mods}\n\n` +
                `* **Removal Reason:** ${settings.removal_reason ? settings.removal_reason.title : "None" }\n\n` +
                `* **Expiration:** ${DURATIONS[settings.expiration]}\n\n` +
                `* **Sticky Comment:** ${settings.sticky_comment_text ? quoteText(settings.sticky_comment_text) : "None"}`,
        });
      settings.conversation_id = conversation.id; // Store for sending follow-up messages

      // Sticky Comment
      if (settings.sticky_comment_text) {
        const comment = await context.reddit.submitComment({
          id: settings.post_id,
          text: settings.sticky_comment_text,
        });
        await comment.distinguish(true); // Distinguish + Sticky
        settings.sticky_comment_id = comment.id;
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

      // Send ModMail reply
      await context.reddit.modMail.reply({
        conversationId: settings_old.conversation_id!,
        body: `u/${mod.username} has disabled flaired user only mode on ` +
              `[${post.title}](${post.permalink}).`,
      });

      // Delete Comment
      if (settings_old.sticky_comment_id) {
        const comment = await context.reddit.getCommentById(settings_old.sticky_comment_id);
        await comment.delete();
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
 * Format string as quoted text in Reddit Markdown
 * @param text A string to format as quoted text
 * @returns A string containing quoted text
 */
function quoteText(text: string): string {
  return "\n >" + text.replace(/\n/g, "\n> ");
}
