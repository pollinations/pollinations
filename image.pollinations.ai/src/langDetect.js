// this script executes python langdetect.py [text] and checks if the result is en

import { exec } from "child_process";
import debug from 'debug';

const logError = debug('pollinations:error');
const logLang = debug('pollinations:lang');

export function detectEnglish(text) {
    return new Promise((resolve, reject) => {
        exec(`python langdetect.py "${text}"`, (err, stdout, stderr) => {
        if (err) {
            logError("ERROR", err);
            reject(err);
        }
        // logLang("stdout", stdout);
        resolve(stdout.trim() === "en");
        });
    });
    }
