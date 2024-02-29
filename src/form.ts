import { Context, Devvit, FormOnSubmitEvent } from "@devvit/public-api";
import { PostSettings } from "./interfaces.js";
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
  const settings: PostSettings | undefined = data.settings;
  const expiration_options = Object.entries(DURATIONS).map(([key, value]) => {
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
        name: "expiration",
        label: "Expiration",
        helpText: "Automatically disable after selected duration",
        type: "select",
        multiSelect: false,
        options: expiration_options,
        defaultValue: settings? [ settings.expiration.toString() ] : [ expiration_default.toString() ],
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
  event.values.expiration = Number(event.values.expiration[0]); // Convert from string[]
  const settings = event.values as PostSettings;

  // Load current post settings
  // Could pass through form data from showPostRestrictForm() handler but starts getting messy
  const settings_old = await getPostSettings(event.values.post_id, context);

  const mod = await context.reddit.getCurrentUser();
  const post = await context.reddit.getPostById(settings.post_id);

  if (settings.is_enabled) {
    if (settings_old) { // Edit
      settings.conversation_id = settings_old.conversation_id; // Propagate to new settings

      if (JSON.stringify(settings) !== JSON.stringify(settings_old)) { // Has Changes
        console.log(`u/${mod.username} edited flaired user only mode on ${settings.post_id}`);

        // Send ModMail reply
        await context.reddit.modMail.reply({
          conversationId: settings_old.conversation_id!,
          body: `u/${mod.username} has edited flaired user only mode on ` +
                `[${post.title}](${post.permalink}).\n\n` + 
                `**Updated Configuration**\n\n` +
                `* **Only restrict top-level comments:** ${settings.top_level_only}\n\n` +
                `* **Expiration:** ${DURATIONS[settings.expiration]}`,
        });

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
                `* **Expiration:** ${DURATIONS[settings.expiration]}`,
        });
      settings.conversation_id = conversation.id; // Store for sending follow-up messages

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

      await clearPostSettings(settings.post_id, context);
      context.ui.showToast({
        text: "Commenting permitted from all users",
        appearance: "success",
      });  
    } else { // Never Enabled
      context.ui.showToast({
        text: "Commenting permitted from all users. Did you forget to enable Flaired Only mode?",
        appearance: "neutral",
      });
    }
  }
}
