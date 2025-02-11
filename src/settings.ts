import { SettingsFormField } from "@devvit/public-api";

export const settings: SettingsFormField[] = [
  {
    scope: "installation",
    type: "paragraph",
    name: "sticky_comment_text_default",
    label: "Default Sticky Comment",
    helpText: "Default text for sticky comments on restricted posts. Use the placeholder %%flair%% to include a list of the selected flairs. Leave empty to disable. Can be modified when configuring individual posts.",
    defaultValue: "",
  },
];
