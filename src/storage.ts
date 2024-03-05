import { Context, TriggerContext } from "@devvit/public-api";
import { PostSettings } from "./interfaces.js";

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
  await context.redis
    .expire(settings.post_id, settings.expiration)
    .catch((e) => console.error(`Error setting expiration (${settings.expiration}) for ${settings.post_id} in Redis`, e));
}

/**
 * Read {@link PostSettings}} object for a post from Redis
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
