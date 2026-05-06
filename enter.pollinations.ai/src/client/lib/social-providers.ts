export type SocialProvider = "github" | "google" | "discord";

export const SOCIAL_PROVIDERS: Array<{
    id: SocialProvider;
    label: string;
}> = [
    { id: "github", label: "GitHub" },
    { id: "google", label: "Google" },
    { id: "discord", label: "Discord" },
];
