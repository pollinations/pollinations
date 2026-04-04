import { Command } from "commander";
import { showAuthStatus } from "./auth.js";

export const whoamiCommand = new Command("whoami")
    .description("Show current identity (alias for auth status)")
    .action(showAuthStatus);
