// this script executes python langdetect.py [text] and checks if the result is en

import { exec } from "node:child_process";
import debug from "debug";

const logError = debug("pollinations:error");

export async function detectEnglish(text: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        exec(`python langdetect.py "${text}"`, (err, stdout, _stderr) => {
            if (err) {
                logError("ERROR", err);
                reject(err);
            }
            resolve(stdout.trim() === "en");
        });
    });
}
