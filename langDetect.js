// this script executes python langdetect.py [text] and checks if the result is en

import { exec } from "child_process";

export function detectEnglish(text) {
    return new Promise((resolve, reject) => {
        exec(`python langdetect.py "${text}"`, (err, stdout, stderr) => {
        if (err) {
            console.log("ERROR", err);
            reject(err);
        }
        // console.log("stdout", stdout);
        resolve(stdout.trim() === "en");
        });
    });
    }
