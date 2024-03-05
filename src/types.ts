import { RemovalReason } from "@devvit/public-api";

/**
 * Settings for configuring flaired user only mode on a post
 */
export type PostSettings = {
  /** Reddit post ID (including `t3_` prefix) */
  post_id: string;
  /** Enable flaired user only mode */
  is_enabled: boolean;
  /** Only apply restriction to top-level comments */
  top_level_only: boolean;
  /** Duration (in seconds) until flaired user only mode is disabled */
  expiration: number;
  /** Subreddit removal reason to use on actioned comments */
  removal_reason?: RemovalReason;
  /** ModMail conversation ID for use with follow-up messages */
  conversation_id?: string;
  /** Text to use in sticky comment */
  sticky_comment_text: string;
  /** Sticky comment ID */
  sticky_comment_id?: string;
};
