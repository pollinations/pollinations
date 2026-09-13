#!/usr/bin/env node
// Converts raw NPC exchange logs into OpenAI-style fine-tuning JSONL.
//
// Input (one JSON object per line):
//   {"playerMessage": "Can I have a sword?", "say": "Here you go!", "action": {"type": "give_item", "item": "sword"}}
//
// Output (one JSON object per line):
//   {"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
//
// Usage:
//   node prepare-finetune-data.js --in raw-logs.jsonl --out train.jsonl --persona "You are Grix, a blacksmith."

const fs = require("node:fs");

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i].replace(/^--/, "");
        args[key] = argv[i + 1];
    }
    return args;
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    if (!args.in || !args.out || !args.persona) {
        console.error(
            'Usage: node prepare-finetune-data.js --in <raw.jsonl> --out <train.jsonl> --persona "<short system prompt>"',
        );
        process.exit(1);
    }

    const lines = fs.readFileSync(args.in, "utf8").split("\n").filter(Boolean);
    const out = fs.createWriteStream(args.out);

    let written = 0;
    let skipped = 0;

    for (const line of lines) {
        let record;
        try {
            record = JSON.parse(line);
        } catch {
            skipped += 1;
            continue;
        }

        if (!record.playerMessage || !record.say) {
            skipped += 1;
            continue;
        }

        const assistantContent = JSON.stringify(
            record.action
                ? { say: record.say, action: record.action }
                : { say: record.say },
        );

        const example = {
            messages: [
                { role: "system", content: args.persona },
                { role: "user", content: record.playerMessage },
                { role: "assistant", content: assistantContent },
            ],
        };

        out.write(`${JSON.stringify(example)}\n`);
        written += 1;
    }

    out.end(() => {
        console.log(
            `Wrote ${written} training examples to ${args.out} (skipped ${skipped} malformed lines).`,
        );
    });
}

main();
