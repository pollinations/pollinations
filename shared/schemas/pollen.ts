import { z } from "zod";

export const PollenSchema = z.enum(["quest", "all"]).meta({
    description:
        "Model eligibility for an agent run. quest excludes models requiring purchased Pollen; all (default) permits both. This does not select which wallet balance is debited.",
});
