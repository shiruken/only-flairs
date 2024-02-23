import { Devvit, FormOnSubmitEvent } from "@devvit/public-api";
import { clearPostSettings, getPostSettings, storePostSettings } from "./storage.js";
import { PostSettings } from "./types.js";

Devvit.configure({
  redditAPI: true,
  redis: true,
});

const form = Devvit.createForm((data) => {
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
        defaultValue: true,
      },
      {
        name: 'top_level_only',
        label: 'Only restrict top-level comments',
        helpText: 'Allow comment replies from any user regardless of flair',
        type: 'boolean',
        defaultValue: false
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
    await storePostSettings(settings.post_id, settings, context);
    console.log(`u/${mod.username} enabled flaired user only mode on ${settings.post_id}`);
    context.ui.showToast("Commenting restricted to flaired users");
  } else {
    await clearPostSettings(settings.post_id, context);
    console.log(`u/${mod.username} disabled flaired user only mode on ${settings.post_id}`);
    context.ui.showToast("Commenting permitted from all users");
  }
}

Devvit.addMenuItem({
  location: "post",
  forUserType: "moderator",
  label: "Restrict to Flaired Users",
  description: "Restrict commenting on this post to only flaired users",
  onPress: async (event, context) => {
    const data = {
      post_id: event.targetId,
    };
    context.ui.showForm(form, data);
  },
});

Devvit.addTrigger({
  event: "CommentSubmit",
  onEvent: async (event, context) => {
    const comment = event.comment;
    if (!comment) {
      throw new Error("Comment object missing from event data");
    }

    const author = event.author;
    if (!author || !author.flair) {
      throw new Error("Author object missing from event data");
    }

    const settings = await getPostSettings(comment.postId, context);
    if (!settings) {
      return;
    }

    // If enabled, exclude comment replies
    if (settings.top_level_only && comment.parentId != comment.postId) {
      return;
    }

    if (author.flair.text == "") {
      const commentAPI = await context.reddit.getCommentById(comment.id);
      await commentAPI
        .remove()
        .then(() => console.log(`Removed ${comment.id} by u/${author.name}`))
        .catch((e) => console.error(`Error removing ${comment.id} by u/${author.name}`, e));
      await commentAPI
        .addRemovalNote({
          reasonId: "",
          modNote: `Commenting restricted to flaired users on ${comment.postId}`,
        });
    }

  },
});

export default Devvit;
