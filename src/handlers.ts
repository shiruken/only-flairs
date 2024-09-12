import { Context, MenuItemOnPressEvent, TriggerContext } from "@devvit/public-api";
import { AppInstall, AppUpgrade, ModAction, CommentSubmit } from '@devvit/protos';
import { form } from "./form.js";
import { clearModerators, getModerators, getPostSettings, storeModerators } from "./storage.js";

/**
 * Shows form to adjust post restriction settings
 * @param event A MenuItemOnPressEvent object
 * @param context A Context object
 */
export async function showPostRestrictForm(event: MenuItemOnPressEvent, context: Context): Promise<void> {
  const subreddit = await context.reddit.getCurrentSubreddit();
  const removal_reasons = await context.reddit.getSubredditRemovalReasons(subreddit.name);
  const flairs = await context.reddit.getUserFlairTemplates(subreddit.name);
  const settings = await getPostSettings(event.targetId, context); // Current settings for post
  const sticky_comment_text_default = await context.settings.get<string>("sticky_comment_text_default");
  const data = {
    removal_reasons: removal_reasons,
    flairs: flairs,
    settings: settings,
    sticky_comment_text_default: sticky_comment_text_default,
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
  if (!author) {
    throw new Error("Author object missing from event data");
  }

  // Ignore comments from app
  if (author.name == "only-flairs") {
    return;
  }

  const settings = await getPostSettings(comment.postId, context);
  if (!settings) {
    return;
  }

  // If enabled, exclude comment replies
  if (settings.top_level_only && comment.parentId != comment.postId) {
    return;
  }

  // If enabled, exclude subreddit moderators
  if (settings.exclude_mods) {
    const mods = await getModerators(context);
    if (!mods) {
      console.error('Cached modlist is empty. Unable to exclude moderators from commenting restrictions.');
    } else {
      if (mods.includes(author.name)) {
        console.log(`Skipped ${comment.id} by moderator u/${author.name}`);
        return;
      }
    }
  }

  if (!author.flair) {
    console.error(`Author flair object missing from event data on ${comment.id}. Will be removed by default.`);
  }

  if (
    !author.flair ||
    author.flair.text == "" ||
    (!settings.flairs.includes("any") && !settings.flairs.includes(author.flair.templateId))
  ) {
    const commentAPI = await context.reddit.getCommentById(comment.id);
    await commentAPI
      .remove()
      .then(() => console.log(`Removed ${comment.id} by u/${author.name}`))
      .catch((e) => console.error(`Error removing ${comment.id} by u/${author.name}`, e));

    await commentAPI
      .addRemovalNote({
        reasonId: settings.removal_reason ? settings.removal_reason.id : "",
        modNote: `Commenting restricted to flaired users on ${comment.postId}`,
      })
      .catch((e) => console.error(`Error adding removal note to ${comment.id} by u/${author.name}`, e));
  }
}

/**
 * Cache modlist when app is installed or upgraded
 * @param event An AppInstall or AppUpgrade object
 * @param context A TriggerContext object
 */
export async function onAppChanged(_event: AppInstall | AppUpgrade, context: TriggerContext) {
  await clearModerators(context)
    .then(() => console.log("Cleared cached modlist on app change"));
  await refreshModerators(context);
}

/**
 * Update cached modlist on modlist change
 * @param event A ModAction object
 * @param context A TriggerContext object
 */
export async function onModAction(event: ModAction, context: TriggerContext) {
  const action = event.action;
  if (!action) {
    throw new Error(`Missing action in onModAction`);
  }
  const actions = ['acceptmoderatorinvite', 'addmoderator', 'removemoderator', 'reordermoderators'];
  if (actions.includes(action)) {
    await clearModerators(context)
      .then(() => console.log(`Cleared cached modlist on ${action}`));
    await refreshModerators(context);
  }
}

/**
 * Refresh cached modlist
 * @param context A TriggerContext object
 */
async function refreshModerators(context: TriggerContext) {
  const subreddit = await context.reddit.getCurrentSubreddit();
  const moderators: string[] = [];
  try {
    for await(const moderator of subreddit.getModerators({ pageSize: 500 })) {
      moderators.push(moderator.username);
    }
  } catch (err) {
    throw new Error(`Error fetching modlist for r/${subreddit.name}: ${err}`);
  }
  if (!moderators.length) {
    throw new Error(`Fetched modlist for r/${subreddit.name} is empty, skipping cache update`);
  }
  await storeModerators(moderators, context);
}
