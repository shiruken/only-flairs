# ![Only Flairs Logo](https://github.com/shiruken/only-flairs/assets/867617/a9343ef4-82ce-4bea-a5cf-705c5318b7c8)

Easily restrict commenting on individual posts to only users [flaired](https://support.reddithelp.com/hc/en-us/articles/15484503095060-User-Flair) in your subreddit.

[https://developers.reddit.com/apps/only-flairs](https://developers.reddit.com/apps/only-flairs)

## Features

* Minimal setup requiring **zero** knowledge about AutoModerator or coding
* Moderator enabled on a **post-by-post** basis
* Automatically removes incoming comments from unflaired users
  * Easily specify which user flairs are allowed to comment
  * Optionally allow replies to top-level comments
  * Apply subreddit removal reason to actions
* Customizable sticky comment to inform users about restrictions
* Automatically disabled after user-selected duration
* Notifications via Modmail

## Installation Settings

![Screenshot of Installation Settings](https://github.com/user-attachments/assets/58f9bf21-8169-4ed0-9aef-69fd714b4e34)

* **Default Sticky Comment:** Sets the default text for sticky comments on restricted posts. Supports Markdown. Use the placeholder `%%flair%%` to include a list of the selected flairs. Leave empty to disable. Can be modified when configuring the settings on individual posts.

## Menu Action: Restrict to Flaired Users

This action appears under the moderator menu on posts in the subreddit. It allows for enabling and configuring flair-based commenting restrictions on the post.

![Screenshot of 'Restrict to Flaired Users' Menu Action](https://github.com/user-attachments/assets/2fc1d886-af64-4b4b-b413-c4a63e86c725) ![Screenshot of 'Restrict to Flaired Users' Form](https://github.com/user-attachments/assets/d9f262fd-1a44-466a-b8de-2946ab729cdf)

* **Enable:** Enable or disable flaired user only mode (make sure to actually enable it!)
* **User Flairs:** Only allow comments from users with the selected flair(s). The 'Any' option allows any user with flair to comment.
* **Only Restrict Top-Level Comments:** Allow comment replies from any user regardless of flair
* **Exclude Moderators:** Exclude subreddit moderators from comment restrictions
* **Removal Reason:** Subreddit removal reason to use on actioned comments. Select 'None' to specify no removal reason.
* **Sticky Comment:** Text for the sticky comment on the post. Use the placeholder `%%flair%%` to include a list of the selected flairs. Leave empty to disable. Defaults to the value defined in the installation settings.
* **Expiration:** Automatically disable comment restrictions after selected duration

## Notifications: Modmail

A Modmail conversation is created when flaired user only mode is enabled on a post. Any changes to the configuration are reported as responses to the original message.

![Screenshot of Modmail Conversation](https://github.com/user-attachments/assets/8f21499f-0efc-499a-ba38-dc0ba0abffcf)

## Moderation Actions

### Comment Removal

![Screenshot of Removed Comment](https://github.com/user-attachments/assets/f33d2323-11ba-41f7-a8c6-fc881d142f09)

![Screenshot of Mod Log Entry](https://github.com/user-attachments/assets/d36adb08-9fde-4be3-9cd0-672a045c7c88)

* No removal reason will be applied if the 'Removal Reason' setting is set to 'None'

### Sticky Comment

![Screenshot of Sticky Comment](https://github.com/user-attachments/assets/041f9548-a6e7-4f85-b680-f77ba731ec9c)

* Sticky comments will be edited or deleted as the configuration on an individual post is modified
* Manually disabling flaired user only mode will result in the sticky comment being deleted
* Sticky comments *are not automatically deleted* when the comment restriction expires

## Changelog

*[View Releases on GitHub](https://github.com/shiruken/only-flairs/releases)*

* v0.5
  * Add placeholder text to include list of flairs in sticky comment
  * Add option to disable automatic expiration
* v0.4
  * Modmail notifications are now routed into the Inbox rather than Mod Discussions
  * Improved checking for presence of user flair
  * Add option to specify user flairs that are allowed to comment
* v0.3
  * Resolved issue with blank options appearing in form for Removal Reason and Expiration fields
  * Simplified form by eliminating pass-through variable
  * Default to removing comments if user flair information is missing
  * Add option to exclude moderators
* v0.2
  * Automatically post sticky comment with user-defined text
  * Specify default sticky comment text in installation settings
  * Allow specifying removal reason
  * Send Modmail on configuration change
  * Improve messaging when configuration is unchanged or form is submitted without enabling
* v0.1
  * Automatically expire restrictions after user-specified duration
  * Add option to ignore comment replies
  * If already enabled, use the current settings when displaying the form
  * Initial Release

## Links

* [Source Code](https://github.com/shiruken/only-flairs)
* [Reddit: User Flair](https://support.reddithelp.com/hc/en-us/articles/15484503095060-User-Flair)
