import { Devvit, TriggerContext } from "@devvit/public-api";
import { PostSettings } from "./interfaces.js";

export async function storePostSettings(settings: PostSettings, context: Devvit.Context): Promise<void> {
  const value = JSON.stringify(settings);
  await context.redis
    .set(settings.post_id, value)
    .catch((e) => console.error(`Error writing ${settings.post_id} to Redis`, e));
  await context.redis
    .expire(settings.post_id, settings.expiration)
    .catch((e) => console.error(`Error setting expiration (${settings.expiration}) for ${settings.post_id} in Redis`, e));
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

export async function keyExists(post_id: string, context: Devvit.Context): Promise<boolean> {
  const type = await context.redis.type(post_id);
  return type === "string";
}
