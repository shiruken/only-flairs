import { RemovalReason } from "@devvit/public-api";

/**
 * Settings for restricting commenting to flaired users on a post
 * @property {string} post_id: Reddit post ID (including `t3_` prefix)
 * @property {boolean} is_enabled: Enable flaired user only mode
 * @property {boolean} top_level_only: Only apply restriction to top-level comments
 * @property {number} expiration: Duration (in seconds) until flaired user only mode is disabled
 * @property {RemovalReason} removal_reason: Subreddit removal reason to use on actioned comments
 * @property {string} conversation_id: ModMail conversation ID for use with follow-up messages
 */
export interface PostSettings {
  post_id: string;
  is_enabled: boolean;
  top_level_only: boolean;
  expiration: number;
  removal_reason?: RemovalReason;
  conversation_id?: string;
}
