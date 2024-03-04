import { SettingsFormField } from "@devvit/public-api";

export const appSettings: SettingsFormField[] = [
  {
    scope: "installation",
    type: "string",
    name: "removal_reason",
    label: "Removal Reason (Optional)",
    helpText: "Enter title of subreddit removal reason to use on actioned comments (text must match exactly). If not set, no removal reason will be applied.",
    defaultValue: "",
    onValidate: (event) => {
      if (event.value && event.value.length > 50) {
        return "Text too long. Removal reason titles are limited to 50 characters."
      }
    },
  },
];
