import { Devvit } from "@devvit/public-api";
import { settings } from "./settings.js";
import { checkComment, onAppChanged, onModAction, showPostRestrictForm, showRemoveRestrictionForm } from "./handlers.js";
import { EXPIRE_JOB_NAME, onExpireRestrictions } from "./scheduler.js";

Devvit.configure({
  redditAPI: true,
  redis: true,
});

Devvit.addSettings(settings);

// Moderator menu item to enable or edit flaired user only mode
Devvit.addMenuItem({
  location: "post",
  forUserType: "moderator",
  label: "Restrict to Flaired Users",
  description: "Restrict commenting on this post to only flaired users",
  onPress: showPostRestrictForm,
});

// Moderator menu item to disable flaired user only mode
Devvit.addMenuItem({
  location: "post",
  forUserType: "moderator",
  label: "Remove Flair Restriction",
  description: "Allow comments from all users on this post",
  onPress: showRemoveRestrictionForm,
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

// Expire commenting restrictions on schedule
Devvit.addSchedulerJob({
  name: EXPIRE_JOB_NAME,
  onRun: onExpireRestrictions,
});

export default Devvit;
