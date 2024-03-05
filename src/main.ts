import { Devvit } from "@devvit/public-api";
import { checkComment, showPostRestrictForm } from "./handlers.js";

Devvit.configure({
  redditAPI: true,
  redis: true,
});

// Moderator menu item to toggle flaired user only mode
Devvit.addMenuItem({
  location: "post",
  forUserType: "moderator",
  label: "Restrict to Flaired Users",
  description: "Restrict commenting on this post to only flaired users",
  onPress: showPostRestrictForm,
});

// Check all incoming comments
Devvit.addTrigger({
  event: "CommentSubmit",
  onEvent: checkComment,
});

export default Devvit;
