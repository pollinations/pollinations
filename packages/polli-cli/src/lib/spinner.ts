import ora, { Ora } from "ora";
import { getOutputMode, isQuietMode } from "./output.js";

let currentSpinner: Ora | null = null;

export function startSpinner(text: string): void {
    if (isQuietMode() || getOutputMode() !== "human") return;
    if (currentSpinner) {
        currentSpinner.stop();
    }
    currentSpinner = ora({ text, color: "cyan", spinner: "dots" }).start();
}

export function stopSpinner(success = true, finalText?: string): void {
    if (currentSpinner) {
        if (success) {
            currentSpinner.succeed(finalText);
        } else {
            currentSpinner.fail(finalText);
        }
        currentSpinner = null;
    }
}

export function updateSpinner(text: string): void {
    if (currentSpinner) {
        currentSpinner.text = text;
    }
}

export function withSpinner<T>(text: string, fn: () => Promise<T>): Promise<T> {
    startSpinner(text);
    return fn()
        .then((result) => {
            stopSpinner(true);
            return result;
        })
        .catch((err) => {
            stopSpinner(false, err instanceof Error ? err.message : "Failed");
            throw err;
        });
}