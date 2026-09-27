import { RUNTIME_ORIGIN } from "./local-origins";

const response = await fetch(`${RUNTIME_ORIGIN}/__flow/reset`, {
    method: "POST",
});
if (!response.ok)
    throw new Error(
        `Flow reset failed (${response.status}). Start npm run dev first.`,
    );
console.log(
    "Flow's local account, app and conditions are reset. Reload Flow to continue.",
);
