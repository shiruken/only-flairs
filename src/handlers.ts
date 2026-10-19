import { Comment, Context, MenuItemOnPressEvent, TriggerContext } from "@devvit/public-api";
import { AppInstall, AppUpgrade, ModAction, CommentSubmit } from '@devvit/protos';
import { form } from "./form.js";
import { AuthorFlair, hasAllowedFlair } from "./flair.js";
import { clearPostSettings, getLastRemovalReason, getModerators, getPostSettings, storeModerators } from "./storage.js";
import { cancelExpiration } from "./scheduler.js";
import { PostSettings } from "./types.js";
import { logger } from "./logger.js";

// Comment removal retry behavior
const REMOVE_ATTEMPTS = 2;
const REMOVE_RETRY_DELAY_MS = 1000;

/**
 * Shows form to adjust post restriction settings
 * @param event A MenuItemOnPressEvent object
 * @param context A Context object
 */
export async function showPostRestrictForm(event: MenuItemOnPressEvent, context: Context): Promise<void> {
  logger.form.info(`Opening restriction settings form for ${event.targetId}`);
  const [post, subreddit, rawSettings, sticky_comment_text_default, last_removal_reason] = await Promise.all([
    context.reddit.getPostById(event.targetId),
    context.reddit.getCurrentSubredditName(),
    getPostSettings(event.targetId, context), // Current settings for post
    context.settings.get<string>("sticky_comment_text_default"),
    getLastRemovalReason(context),
  ]);

  if (post.authorName === '[deleted]' || post.removedByCategory === 'deleted') {
    if (rawSettings?.is_enabled) {
      await clearPostSettings(event.targetId, context);
      if (rawSettings.scheduler_job_id) {
        await cancelExpiration(rawSettings.scheduler_job_id, context);
      }
    }
    context.ui.showToast("Cannot configure restrictions on a deleted post");
    return;
  }

  const settings =
    rawSettings?.expires_at && Date.now() >= rawSettings.expires_at
      ? undefined
      : rawSettings;
  const [flairs, removal_reasons] = await Promise.all([
    context.reddit.getUserFlairTemplates(subreddit),
    context.reddit.getSubredditRemovalReasons(subreddit),
  ]);
  const data = {
    settings: settings ?? '',
    sticky_comment_text_default: sticky_comment_text_default ?? '',
    flairs: JSON.stringify(flairs),
    removal_reasons: removal_reasons,
    last_removal_reason: last_removal_reason ?? '',
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
  if (author.name == context.appSlug) {
    logger.comment.debug(`Skipped ${comment.id}: author is app (${author.name})`);
    return;
  }

  const settings = await getPostSettings(comment.postId, context);
  if (!settings) {
    return;
  }

  // If restrictions have expired, allow commenting
  if (settings.expires_at && Date.now() >= settings.expires_at) {
    logger.comment.info(`Skipped ${comment.id} on ${comment.postId}: restrictions expired at ${new Date(settings.expires_at).toISOString()}`);
    return;
  }

  // If enabled, exclude comment replies
  if (settings.top_level_only && comment.parentId != comment.postId) {
    logger.comment.debug(`Skipped ${comment.id} by u/${author.name}: comment reply excluded by top_level_only on ${comment.postId}`);
    return;
  }

  // If enabled, exclude subreddit moderators
  if (settings.exclude_mods) {
    let mods = await getModerators(context);
    if (!mods) {
      logger.modlist.warn('Cached modlist is empty, refreshing');
      mods = await refreshModerators(context)
        .catch((e) => {
          logger.modlist.error('Unable to refresh modlist. Unable to exclude moderators from commenting restrictions.', e);
          return undefined;
        });
    }
    if (mods) {
      if (mods.some((m) => m.toLowerCase() === author.name.toLowerCase())) {
        logger.comment.info(`Skipped ${comment.id} by moderator u/${author.name} on ${comment.postId}`);
        return;
      }
    }
  }

  // If enabled, exclude post author
  if (settings.exclude_author) {
    let opAuthor = settings.op_author_name;
    if (!opAuthor) {
      try {
        const post = await context.reddit.getPostById(comment.postId);
        opAuthor = post.authorName;
      } catch (e) {
        logger.comment.warn(`Unable to fetch post ${comment.postId} to verify author exemption`, e);
      }
    }
    if (
      opAuthor &&
      opAuthor !== '[deleted]' &&
      author.name !== '[deleted]' &&
      author.name.toLowerCase() === opAuthor.toLowerCase()
    ) {
      logger.comment.info(`Skipped ${comment.id} by post author u/${author.name} on ${comment.postId}`);
      return;
    }
  }

  let flair: AuthorFlair | undefined = author.flair;
  let commentAPI: Comment | undefined;
  if (!flair || (!flair.text && !flair.templateId)) {
    // Event data usually omits flair, so fetch comment via API to inspect authorFlair
    logger.comment.debug(`Author flair missing from event payload on ${comment.id}. Checking via API.`);
    commentAPI = await context.reddit.getCommentById(comment.id);
    flair = commentAPI.authorFlair;
  }

  if (!hasAllowedFlair(flair, settings.flairs)) {
    logger.comment.info(`Removing ${comment.id} by u/${author.name} on ${comment.postId} (missing required flair)`);
    await removeComment(comment.id, author.name, settings, context, commentAPI);
  } else {
    logger.comment.info(`Allowed ${comment.id} by u/${author.name} on ${comment.postId} (matched flair)`);
  }
}

/**
 * Remove a comment and add a removal note, retrying the removal once
 * @param comment_id A Reddit comment ID (including `t1_` prefix)
 * @param author_name Username of the comment author
 * @param settings A {@link PostSettings} object for the comment's post
 * @param context A TriggerContext object
 * @param existingComment Optional pre-fetched {@link Comment} object to reuse
 */
async function removeComment(
  comment_id: string,
  author_name: string,
  settings: PostSettings,
  context: TriggerContext,
  existingComment?: Comment
): Promise<void> {
  let commentAPI: Comment | undefined = existingComment;
  for (let attempt = 1; attempt <= REMOVE_ATTEMPTS; attempt++) {
    try {
      if (!commentAPI) {
        commentAPI = await context.reddit.getCommentById(comment_id);
      }
      await commentAPI.remove();
      logger.comment.info(`Removed ${comment_id} by u/${author_name}`);
      break;
    } catch (e) {
      commentAPI = undefined;
      logger.comment.error(`Error removing ${comment_id} by u/${author_name} (attempt ${attempt}/${REMOVE_ATTEMPTS})`, e);
      if (attempt < REMOVE_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, REMOVE_RETRY_DELAY_MS));
      }
    }
  }
  if (!commentAPI) {
    return;
  }

  await commentAPI
    .addRemovalNote({
      reasonId: settings.removal_reason != "none" ? settings.removal_reason : "",
      modNote: `Commenting restricted to flaired users on ${settings.post_id}`,
    })
    .catch((e) => logger.comment.error(`Error adding removal note to ${comment_id} by u/${author_name}`, e));
}

/**
 * Cache modlist when app is installed or upgraded
 * @param event An AppInstall or AppUpgrade object
 * @param context A TriggerContext object
 */
export async function onAppChanged(_event: AppInstall | AppUpgrade, context: TriggerContext) {
  await refreshModerators(context);
  logger.modlist.info("Refreshed cached modlist on app change");
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
    await refreshModerators(context);
    logger.modlist.info(`Refreshed cached modlist on ${action}`);
  }
}

/**
 * Refresh cached modlist
 *
 * The cache is only overwritten after a successful fetch, so a failed refresh
 * keeps the previous modlist
 * @param context A TriggerContext object
 * @returns A promise that resolves to an array of moderator usernames
 */
async function refreshModerators(context: TriggerContext): Promise<string[]> {
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
  return moderators;
}
