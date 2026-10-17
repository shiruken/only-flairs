import { Comment, Context, MenuItemOnPressEvent, TriggerContext } from "@devvit/public-api";
import { AppInstall, AppUpgrade, ModAction, CommentSubmit } from '@devvit/protos';
import { form } from "./form.js";
import { AuthorFlair, hasAllowedFlair } from "./flair.js";
import { getModerators, getPostSettings, storeModerators } from "./storage.js";
import { PostSettings } from "./types.js";

// Comment removal retry behavior
const REMOVE_ATTEMPTS = 2;
const REMOVE_RETRY_DELAY_MS = 1000;

/**
 * Shows form to adjust post restriction settings
 * @param event A MenuItemOnPressEvent object
 * @param context A Context object
 */
export async function showPostRestrictForm(event: MenuItemOnPressEvent, context: Context): Promise<void> {
  const subreddit = await context.reddit.getCurrentSubredditName();
  const settings = await getPostSettings(event.targetId, context); // Current settings for post
  const sticky_comment_text_default = await context.settings.get<string>("sticky_comment_text_default");
  const flairs = await context.reddit.getUserFlairTemplates(subreddit);
  const removal_reasons = await context.reddit.getSubredditRemovalReasons(subreddit);
  const data = {
    settings: settings ?? '',
    sticky_comment_text_default: sticky_comment_text_default ?? '',
    flairs: JSON.stringify(flairs),
    removal_reasons: removal_reasons,
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
    let mods = await getModerators(context);
    if (!mods) {
      console.warn('Cached modlist is empty, refreshing');
      mods = await refreshModerators(context)
        .catch((e) => {
          console.error('Unable to refresh modlist. Unable to exclude moderators from commenting restrictions.', e);
          return undefined;
        });
    }
    if (mods) {
      if (mods.includes(author.name)) {
        console.log(`Skipped ${comment.id} by moderator u/${author.name}`);
        return;
      }
    }
  }

  let flair: AuthorFlair | undefined = author.flair;
  if (!flair) {
    // Event data sometimes omits flair, so look it up before removing
    console.warn(`Author flair object missing from event data on ${comment.id}. Checking comment author flair.`);
    const commentAPI = await context.reddit.getCommentById(comment.id);
    flair = commentAPI.authorFlair;
  }

  if (!hasAllowedFlair(flair, settings.flairs)) {
    await removeComment(comment.id, author.name, settings, context);
  }
}

/**
 * Remove a comment and add a removal note, retrying the removal once
 * @param comment_id A Reddit comment ID (including `t1_` prefix)
 * @param author_name Username of the comment author
 * @param settings A {@link PostSettings} object for the comment's post
 * @param context A TriggerContext object
 */
async function removeComment(comment_id: string, author_name: string, settings: PostSettings, context: TriggerContext): Promise<void> {
  let commentAPI: Comment | undefined;
  for (let attempt = 1; attempt <= REMOVE_ATTEMPTS; attempt++) {
    try {
      commentAPI = await context.reddit.getCommentById(comment_id);
      await commentAPI.remove();
      console.log(`Removed ${comment_id} by u/${author_name}`);
      break;
    } catch (e) {
      commentAPI = undefined;
      console.error(`Error removing ${comment_id} by u/${author_name} (attempt ${attempt}/${REMOVE_ATTEMPTS})`, e);
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
    .catch((e) => console.error(`Error adding removal note to ${comment_id} by u/${author_name}`, e));
}

/**
 * Cache modlist when app is installed or upgraded
 * @param event An AppInstall or AppUpgrade object
 * @param context A TriggerContext object
 */
export async function onAppChanged(_event: AppInstall | AppUpgrade, context: TriggerContext) {
  await refreshModerators(context);
  console.log("Refreshed cached modlist on app change");
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
    console.log(`Refreshed cached modlist on ${action}`);
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
