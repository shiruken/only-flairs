import { Devvit, FormOnSubmitEvent } from "@devvit/public-api";
import { PostSettings } from "./interfaces.js";
import { clearPostSettings, keyExists, storePostSettings } from "./storage.js";

/**
 * Post restriction settings form
 */
export const form = Devvit.createForm((data) => {
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
        defaultValue: data.settings ? data.settings.is_enabled : false,
      },
      {
        name: "top_level_only",
        label: "Only restrict top-level comments",
        helpText: "Allow comment replies from any user regardless of flair",
        type: "boolean",
        defaultValue: data.settings ? data.settings.top_level_only : false,
      },
      {
        name: "expiration",
        label: "Expiration",
        helpText: "Automatically disable after selected duration",
        type: "select",
        multiSelect: false,
        options: [
          { label: "1 hour", value: "3600" },
          { label: "2 hours", value: "7200" },
          { label: "4 hours", value: "14400" },
          { label: "6 hours", value: "21600" },
          { label: "12 hours",value: "43200" },
          { label: "1 day", value: "86400" },
          { label: "2 days", value: "172800" },
          { label: "3 days", value: "259200" },
          { label: "7 days", value: "604800" },
          { label: "14 days", value: "1209600" },
          { label: "30 days", value: "2592000" },
        ],
        defaultValue: data.settings? [ `${data.settings.expiration}` ] : [ "2592000" ], // 30 days
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
 * @param context A Devvit.Context object
 */
async function processForm(event: FormOnSubmitEvent, context: Devvit.Context): Promise<void> {
  event.values.expiration = Number(event.values.expiration[0]); // Convert from string[]
  const settings = event.values as PostSettings;
  const mod = await context.reddit.getCurrentUser();
  if (settings.is_enabled) {
    const isEdit = await keyExists(settings.post_id, context);
    if (isEdit) {
      console.log(`u/${mod.username} edited flaired user only mode on ${settings.post_id}`);
    } else {
      console.log(`u/${mod.username} enabled flaired user only mode on ${settings.post_id}`);
    }
    await storePostSettings(settings, context);
    context.ui.showToast({
      text: "Commenting restricted to flaired users",
      appearance: "success",
    });
  } else {
    await clearPostSettings(settings.post_id, context);
    console.log(`u/${mod.username} disabled flaired user only mode on ${settings.post_id}`);
    context.ui.showToast({
      text: "Commenting permitted from all users",
      appearance: "success",
    });
  }
}
