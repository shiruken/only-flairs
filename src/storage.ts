import { Devvit, TriggerContext } from "@devvit/public-api";
import { PostSettings } from "./types.js";

export async function storePostSettings(id: string, settings: PostSettings, context: Devvit.Context): Promise<void> {
  const value = JSON.stringify(settings);
  await context.redis.set(id, value);
}

export async function getPostSettings(id: string, context: TriggerContext): Promise<PostSettings | undefined> {
  const settings = await context.redis.get(id);
  if (!settings) {
    return undefined;
  }
  return JSON.parse(settings) as PostSettings;
}

export async function clearPostSettings(id: string, context: Devvit.Context): Promise<void> {
  await context.redis.del(id);
}
