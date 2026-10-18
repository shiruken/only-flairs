import { Context, TriggerContext } from "@devvit/public-api";
import { PostSettings } from "./types.js";
import { logger } from "./logger.js";

/** Extra grace period (in seconds) added to Redis TTL so post settings persist for cleanup jobs */
export const REDIS_EXPIRATION_GRACE_SECONDS = 86400;

/** Fallback TTL (in seconds) for posts with indefinite (0) expiration (~180 days) */
export const INDEFINITE_POST_TTL_SECONDS = 180 * 24 * 60 * 60;

/** Time-to-live (in seconds) for cached moderator list to self-heal missed webhooks (2 hours) */
export const MODERATOR_CACHE_TTL_SECONDS = 7200;

/**
 * Write {@link PostSettings} object for a post in Redis
 * @param settings A {@link PostSettings} object
 * @param context A Context object
 */
export async function storePostSettings(settings: PostSettings, context: Context): Promise<void> {
  const value = JSON.stringify(settings);
  try {
    await context.redis.set(settings.post_id, value);
    const ttl =
      settings.expiration > 0
        ? settings.expiration + REDIS_EXPIRATION_GRACE_SECONDS
        : INDEFINITE_POST_TTL_SECONDS;
    await context.redis.expire(settings.post_id, ttl);
  } catch (e) {
    logger.storage.error(`Error writing ${settings.post_id} to Redis`, e);
    throw e;
  }
}

/**
 * Read {@link PostSettings} object for a post from Redis
 * @param post_id A Reddit post ID (including `t3_` prefix)
 * @param context A Context or TriggerContext object
 * @returns A Promise that resolves to a {@link PostSettings} object if found, otherwise `undefined`
 */
export async function getPostSettings(post_id: string, context: Context | TriggerContext): Promise<PostSettings | undefined> {
  const settings = await context.redis.get(post_id);
  if (!settings) {
    return undefined;
  }
  return JSON.parse(settings) as PostSettings;
}

/**
 * Removes entry for `post_id` from Redis
 * @param post_id A Reddit post ID (including `t3_` prefix)
 * @param context A Context or TriggerContext object
 */
export async function clearPostSettings(post_id: string, context: Context | TriggerContext): Promise<void> {
  try {
    await context.redis.del(post_id);
  } catch (e) {
    logger.storage.error(`Error deleting ${post_id} in Redis`, e);
    throw e;
  }
}

/**
 * Get array of cached moderator usernames from Redis
 * @param context A TriggerContext object
 * @returns A promise that resolves to an array of moderator usernames
 */
export async function getModerators(context: TriggerContext): Promise<string[] | undefined> {
  const moderators = await context.redis.get("$mods");
  if (!moderators) {
    return undefined;
  }
  return moderators.split(",");
}

/**
 * Write array of moderator usernames in Redis
 * @param moderators Array of moderator usernames
 * @param context A TriggerContext object
 */
export async function storeModerators(moderators: string[], context: TriggerContext): Promise<void> {
  try {
    await context.redis.set("$mods", moderators.toString());
    await context.redis.expire("$mods", MODERATOR_CACHE_TTL_SECONDS);
    logger.modlist.info(`Wrote ${moderators.length} moderators to Redis with ${MODERATOR_CACHE_TTL_SECONDS}s TTL`);
  } catch (e) {
    logger.modlist.error("Error writing moderators to Redis", e);
  }
}
