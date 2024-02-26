import { Devvit, TriggerContext } from "@devvit/public-api";
import { PostSettings } from "./types.js";

export async function storePostSettings(post_id: string, settings: PostSettings, context: Devvit.Context): Promise<void> {
  const value = JSON.stringify(settings);
  await context.redis
    .set(post_id, value)
    .catch((e) => console.error(`Error writing ${post_id} to Redis`, e));
  await context.redis
    .expire(post_id, 60*60*24*30) // 30 days
    .catch((e) => console.error(`Error setting expiration for ${post_id} in Redis`, e));
}

export async function getPostSettings(post_id: string, context: Devvit.Context | TriggerContext): Promise<PostSettings | undefined> {
  const settings = await context.redis.get(post_id);
  if (!settings) {
    return undefined;
  }
  return JSON.parse(settings) as PostSettings;
}

export async function clearPostSettings(post_id: string, context: Devvit.Context): Promise<void> {
  await context.redis
    .del(post_id)
    .catch((e) => console.error(`Error deleting ${post_id} in Redis`, e));
}

export async function isPostSettingsEdit(post_id: string, context: Devvit.Context): Promise<boolean> {
  const settings = await context.redis.get(post_id);
  if (!settings) {
    return false;
  } else {
    return true;
  }
}
