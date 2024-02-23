import { Devvit, MenuItemOnPressEvent, TriggerContext } from "@devvit/public-api";
import { CommentSubmit } from '@devvit/protos';
import { form } from "./form.js";
import { getPostSettings } from "./storage.js";

export async function showPostRestrictForm(event: MenuItemOnPressEvent, context: Devvit.Context): Promise<void> {
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
}

export async function checkComment(event: CommentSubmit, context: TriggerContext): Promise<void> {
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
}
