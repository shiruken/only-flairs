import { Context, MenuItemOnPressEvent, TriggerContext } from "@devvit/public-api";
import { CommentSubmit } from '@devvit/protos';
import { form } from "./form.js";
import { getPostSettings } from "./storage.js";

/**
 * Shows form to adjust post restriction settings
 * @param event A MenuItemOnPressEvent object
 * @param context A Context object
 */
export async function showPostRestrictForm(event: MenuItemOnPressEvent, context: Context): Promise<void> {
  const data = {
    post_id: event.targetId,
    settings: await getPostSettings(event.targetId, context),
  };
  context.ui.showForm(form, data);
}

/**
 * Checks comment author flair and removes when post is restricted
 * @param event A CommentSubmit object
 * @param context A TriggerContext object
 */
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
