# ![Only Flairs Logo](https://github.com/shiruken/only-flairs/assets/867617/a9343ef4-82ce-4bea-a5cf-705c5318b7c8)

Easily restrict commenting on individual posts to only users [flaired](https://support.reddithelp.com/hc/en-us/articles/15484503095060-User-Flair) in your subreddit.

[https://developers.reddit.com/apps/only-flairs](https://developers.reddit.com/apps/only-flairs)

## Features

* Minimal setup requiring **zero** knowledge about AutoModerator or coding
* Moderator enabled on a post-by-post basis
* Automatically removes all comments from unflaired users
  * Optionally allow replies to top-level comments
  * Easily apply subreddit removal reason to actions
* Customizable sticky comment to inform users
* Restrictions expire after user-selected duration
* Notifications via Modmail

## Screenshots

### Installation Settings

![Screenshot of Installation Settings](https://github.com/shiruken/only-flairs/assets/867617/e01adb76-f655-4d91-ac26-69b8cd29f3a6)

* **Default Sticky Comment:** Sets the default text for sticky comments on restricted posts. Can be modified when configuring the settings on individual posts. Supports Markdown. Leave empty to disable.

### Post Action

![Mod Menu Action](https://github.com/shiruken/only-flairs/assets/867617/e8812150-5be4-4384-876c-4c2957e2b3c5) ![Post Restriction Settings](https://github.com/shiruken/only-flairs/assets/867617/1aa704f4-f802-4ea0-9d6a-eab91c3f172c)


* Sticky comment text defaults to the value defined in the app installation settings.

### Removed Comment

![Removed Comment](https://github.com/shiruken/only-flairs/assets/867617/fc290373-2176-4ef4-bd7a-5d2aaa20b654)

### Stickied Comment

![Stickied Comment](https://github.com/shiruken/only-flairs/assets/867617/ff0e6f51-4248-4679-8f72-54b8f993e7c3)

* Sticky comments will be edited or deleted as the configuration on an individual post is modified.
* Manually disabling flaired user only mode will result in the sticky comment being deleted.
* Sticky comments _are not automatically deleted_ when the comment restriction expires.

### Modmail Notifications

![Modmail Conversation](https://github.com/shiruken/only-flairs/assets/867617/c879ea59-d449-4ad0-b4f6-43559d0ced33)

## Links

* [Source Code](https://github.com/shiruken/only-flairs)
* [Changelog](https://github.com/shiruken/only-flairs/releases)
* [Reddit: User Flair](https://support.reddithelp.com/hc/en-us/articles/15484503095060-User-Flair)
