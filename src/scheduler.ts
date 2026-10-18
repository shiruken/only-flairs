import { Context, JobContext, ScheduledJobEvent } from "@devvit/public-api";
import { clearPostSettings, getPostSettings } from "./storage.js";
import { notifyMods } from "./form.js";
import { logger } from "./logger.js";

/** Job name registered with Devvit scheduler */
export const EXPIRE_JOB_NAME = "expire_restrictions";

/**
 * Schedule an expiration job for a post
 * @param postId Reddit post ID (including `t3_` prefix)
 * @param durationSeconds Duration in seconds until expiration
 * @param context Context object with scheduler client
 * @returns The scheduled job ID, or `undefined` if scheduling failed
 */
export async function scheduleExpiration(
  postId: string,
  durationSeconds: number,
  context: Context
): Promise<string | undefined> {
  try {
    const runAt = new Date(Date.now() + durationSeconds * 1000);
    const jobId = await context.scheduler.runJob({
      name: EXPIRE_JOB_NAME,
      data: { postId },
      runAt,
    });
    logger.scheduler.info(`Scheduled expiration job ${jobId} for ${postId} at ${runAt.toISOString()}`);
    return jobId;
  } catch (e) {
    logger.scheduler.error(`Error scheduling expiration job for ${postId}`, e);
    return undefined;
  }
}

/**
 * Cancel an existing scheduled expiration job
 * @param jobId The job ID returned from scheduleExpiration
 * @param context Context object with scheduler client
 */
export async function cancelExpiration(
  jobId: string,
  context: Context | JobContext
): Promise<void> {
  try {
    await context.scheduler.cancelJob(jobId);
    logger.scheduler.info(`Cancelled scheduled expiration job ${jobId}`);
  } catch (e) {
    logger.scheduler.warn(`Error cancelling scheduled expiration job ${jobId}`, e);
  }
}

/**
 * Scheduled job handler executed when post restrictions expire
 *
 * Removes sticky comment, sends ModMail notification, and clears Redis settings.
 * @param event Scheduled job event with post ID payload
 * @param context JobContext object
 */
export async function onExpireRestrictions(
  event: ScheduledJobEvent<{ postId: string }>,
  context: JobContext
): Promise<void> {
  const postId = event.data.postId;
  const settings = await getPostSettings(postId, context);
  if (!settings || !settings.is_enabled) {
    logger.scheduler.debug(`Expiration job fired for ${postId}, but post restrictions are already inactive or cleared`);
    return;
  }

  logger.scheduler.info(`Commenting restrictions expired on ${postId}`);

  // Delete sticky comment if one was posted
  if (settings.sticky_comment_id) {
    try {
      const comment = await context.reddit.getCommentById(settings.sticky_comment_id);
      await comment.delete();
    } catch (e) {
      logger.scheduler.error(`Error deleting sticky comment ${settings.sticky_comment_id} on ${postId}`, e);
    }
  }

  // Send ModMail notification to the existing conversation if post is not deleted or removed
  try {
    const post = await context.reddit.getPostById(postId);
    if (!post.removed && !post.spam && post.authorName !== "[deleted]") {
      await notifyMods(context, post, settings.conversation_id, {
        subject: "Flaired User Only Mode Expired",
        body: `Commenting restrictions on [${post.title}](${post.permalink}) have expired. Commenting is now permitted from all users.`,
      });
    } else {
      logger.scheduler.info(`Skipping expiration notification for removed or deleted post ${postId}`);
    }
  } catch (e) {
    logger.scheduler.error(`Error notifying mods of expiration on ${postId}`, e);
  }

  // Clear Redis settings
  try {
    await clearPostSettings(postId, context);
  } catch (e) {
    logger.scheduler.error(`Error clearing post settings on expiration for ${postId}`, e);
  }
}

