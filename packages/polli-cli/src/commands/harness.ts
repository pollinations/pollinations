import { Command } from "commander";
import { listHarnesses } from "../harnesses/index.js";
import type { HarnessAdapter } from "../harnesses/types.js";
import { fail, printResult } from "../lib/output.js";

type HarnessAction = "on" | "off" | "status";

const run = async (harness: HarnessAdapter, action: HarnessAction) => {
    try {
        printResult(await harness[action]());
    } catch (error) {
        fail(`Could not run ${harness.id} ${action}`, error);
    }
};

const createHarnessCommand = (harness: HarnessAdapter): Command =>
    new Command(harness.id)
        .description(harness.description)
        .action(() => run(harness, "on"))
        .addCommand(
            new Command("on")
                .description(`Enable ${harness.name}`)
                .action(() => run(harness, "on")),
        )
        .addCommand(
            new Command("off")
                .description(`Disable ${harness.name}`)
                .action(() => run(harness, "off")),
        )
        .addCommand(
            new Command("status")
                .description(`Show ${harness.name} status`)
                .action(() => run(harness, "status")),
        );

export const harnessesCommand = new Command("harness").description(
    "Configure coding harnesses to use Pollinations",
);

for (const harness of listHarnesses()) {
    harnessesCommand.addCommand(createHarnessCommand(harness));
}
