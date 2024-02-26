import { Devvit, FormOnSubmitEvent } from "@devvit/public-api";
import { PostSettings } from "./types.js";
import { clearPostSettings, isPostSettingsEdit, storePostSettings } from "./storage.js";

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
        name: "post_id",
        label: "Post ID",
        type: "string",
        defaultValue: data.post_id,
        disabled: true,
      },
    ],
  };
}, formHandler);

async function formHandler(event: FormOnSubmitEvent, context: Devvit.Context) {
  const settings = event.values as PostSettings;
  const mod = await context.reddit.getCurrentUser();
  if (settings.is_enabled) {
    const isEdit = await isPostSettingsEdit(settings.post_id, context);
    if (isEdit) {
      console.log(`u/${mod.username} edited flaired user only mode on ${settings.post_id}`);
    } else {
      console.log(`u/${mod.username} enabled flaired user only mode on ${settings.post_id}`);
    }
    await storePostSettings(settings.post_id, settings, context);
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
