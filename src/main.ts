import { Devvit } from "@devvit/public-api";
import { checkComment, showPostRestrictForm } from "./handlers.js";

Devvit.configure({
  redditAPI: true,
  redis: true,
});

Devvit.addMenuItem({
  location: "post",
  forUserType: "moderator",
  label: "Restrict to Flaired Users",
  description: "Restrict commenting on this post to only flaired users",
  onPress: showPostRestrictForm,
});

Devvit.addTrigger({
  event: "CommentSubmit",
  onEvent: checkComment,
});

export default Devvit;
