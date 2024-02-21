import { Devvit, FormOnSubmitEvent } from "@devvit/public-api";

Devvit.configure({
  redis: true,
});

const form = Devvit.createForm((data) => {
  return {
    title: "Restrict to Flaired Users",
    description: "Restrict commenting on this post to only flaired users",
    acceptLabel: "Save",
    fields: [
      {
        name: "is_enabled",
        label: "Enable",
        helpText: "Enable or disable flaired user only mode",
        type: "boolean",
        defaultValue: true,
      },
      {
        name: "post_id",
        label: "Post ID",
        type: "string",
        defaultValue: data.id,
        disabled: true,
      },
    ],
  };
}, formHandler);

type RestrictedPostSettings = {
  post_id: string;
  is_enabled: boolean;
};

async function formHandler(event: FormOnSubmitEvent, context: Devvit.Context) {
  const settings = event.values as RestrictedPostSettings;
  console.log(settings);
  if (settings.is_enabled) {
    context.redis.set(settings.post_id, JSON.stringify(settings));
    context.ui.showToast("Commenting restricted to flaired users");
  } else {
    context.redis.del(settings.post_id);
    context.ui.showToast("Commenting permitted from all users");
  }
}

Devvit.addMenuItem({
  location: "post",
  forUserType: "moderator",
  label: "Restrict to Flaired Users",
  description: "Restrict commenting on this post to only flaired users",
  onPress: (event, context) => {
    console.log(event);
    const data = {
      id: event.targetId,
    };
    context.ui.showForm(form, data);
  },
});

export default Devvit;
