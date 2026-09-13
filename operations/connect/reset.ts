const response = await fetch("http://localhost:4181/__connect/reset", {
    method: "POST",
});
if (!response.ok)
    throw new Error(
        `Connect reset failed (${response.status}). Start npm run dev first.`,
    );
console.log(
    "Connect's local account, app and conditions are reset. Reload Connect to continue.",
);
export {};
