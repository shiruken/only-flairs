import { Devvit, FormOnSubmitEvent } from "@devvit/public-api";

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

type RestrictedPostSettings = {
  post_id: string;
  is_enabled: boolean;
  top_level_only: boolean;
};

async function formHandler(event: FormOnSubmitEvent, context: Devvit.Context) {
  const settings = event.values as RestrictedPostSettings;
  const mod = await context.reddit.getCurrentUser();
  if (settings.is_enabled) {
    context.redis.set(settings.post_id, JSON.stringify(settings));
    console.log(`u/${mod.username} enabled flaired user only mode on ${settings.post_id}`);
    context.ui.showToast("Commenting restricted to flaired users");
  } else {
    context.redis.del(settings.post_id);
    console.log(`u/${mod.username} disabled flaired user only mode on ${settings.post_id}`);
    context.ui.showToast("Commenting permitted from all users");
  }
}

Devvit.addMenuItem({
  location: "post",
  forUserType: "moderator",
  label: "Restrict to Flaired Users",
  description: "Restrict commenting on this post to only flaired users",
  onPress: (event, context) => {
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

    const value = await context.redis.get(comment.postId);
    if (!value) {
      return;
    }
    const settings: RestrictedPostSettings = JSON.parse(value);

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
