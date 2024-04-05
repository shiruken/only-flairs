import { Devvit } from "@devvit/public-api";
import { settings } from "./settings.js";
import { checkComment, onAppChanged, onModAction, showPostRestrictForm } from "./handlers.js";

Devvit.configure({
  redditAPI: true,
  redis: true,
});

Devvit.addSettings(settings);

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

// Cache modlist during app install or upgrade
Devvit.addTrigger({
  events: ['AppInstall', 'AppUpgrade'],
  onEvent: onAppChanged,
});

// Update cached modlist on modlist change
Devvit.addTrigger({
  event: 'ModAction',
  onEvent: onModAction,
});

export default Devvit;
