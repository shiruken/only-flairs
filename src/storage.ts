import { Context, TriggerContext } from "@devvit/public-api";
import { PostSettings } from "./types.js";

/**
 * Write {@link PostSettings} object for a post in Redis
 * @param settings A {@link PostSettings} object
 * @param context A Context object
 */
export async function storePostSettings(settings: PostSettings, context: Context): Promise<void> {
  const value = JSON.stringify(settings);
  await context.redis
    .set(settings.post_id, value)
    .catch((e) => console.error(`Error writing ${settings.post_id} to Redis`, e));
  if (settings.expiration > 0) {
    await context.redis
      .expire(settings.post_id, settings.expiration)
      .catch((e) => console.error(`Error setting expiration (${settings.expiration}) for ${settings.post_id} in Redis`, e));
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
 * @param context A Context object
 */
export async function clearPostSettings(post_id: string, context: Context): Promise<void> {
  await context.redis
    .del(post_id)
    .catch((e) => console.error(`Error deleting ${post_id} in Redis`, e));
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
export async function storeModerators(moderators: string[], context: TriggerContext) {
  await context.redis
    .set("$mods", moderators.toString())
    .then(() => console.log(`Wrote ${moderators.length} moderators to Redis`))
    .catch((e) => console.error('Error writing moderators to Redis', e));
}

/**
 * Clear cached modlist from Redis
 * @param context A Context object
 */
export async function clearModerators(context: TriggerContext): Promise<void> {
  await context.redis.del("$mods");
}
