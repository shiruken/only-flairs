import { Devvit } from "@devvit/public-api";
import { form } from "./form.js";
import { getPostSettings } from "./storage.js";

Devvit.configure({
  redditAPI: true,
  redis: true,
});

Devvit.addMenuItem({
  location: "post",
  forUserType: "moderator",
  label: "Restrict to Flaired Users",
  description: "Restrict commenting on this post to only flaired users",
  onPress: async (event, context) => {
    let settings = await getPostSettings(event.targetId, context);
    if (!settings) {
      // Default Values
      settings = {
        post_id: event.targetId,
        is_enabled: false,
        top_level_only: false,
      };
    }
    context.ui.showForm(form, settings);
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
