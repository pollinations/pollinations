import type { ReviewRequest } from "./review-requests";
export type ReviewStep = {
    selector: string;
    text?: string;
    action: "click" | "fill" | "wait" | "reload" | "requests";
    value?: string;
    requests?: ReviewRequest[];
};
export function isReviewControlVisible(element: HTMLElement) {
    return (
        element.checkVisibility({
            visibilityProperty: true,
            opacityProperty: true,
        }) && !element.closest('[inert], [aria-hidden="true"]')
    );
}
const storageKey = "connect:review-steps";
export function clearReviewSteps() {
    sessionStorage.removeItem(storageKey);
}
let running = false;
type Progress = { steps: ReviewStep[]; index: number };

// Persist only the review actions, never credentials. Native redirects still
// belong to Enter and the SDK. Resume the same actions after those redirects.
export async function runReviewSteps(steps?: ReviewStep[]) {
    if (steps)
        sessionStorage.setItem(storageKey, JSON.stringify({ steps, index: 0 }));
    if (running) return;
    const stored = sessionStorage.getItem(storageKey);
    if (!stored) return;
    running = true;
    try {
        const progress = JSON.parse(stored) as Progress;
        for (; progress.index < progress.steps.length; ) {
            const step = progress.steps[progress.index];
            const deadline = Date.now() + 15_000;
            let target: HTMLElement | undefined;
            while (!target && Date.now() < deadline) {
                target = [
                    ...document.querySelectorAll<HTMLElement>(step.selector),
                ].find(
                    (element) =>
                        isReviewControlVisible(element) &&
                        !element.matches(':disabled, [aria-disabled="true"]') &&
                        (!step.text ||
                            element.textContent?.trim() === step.text),
                );
                if (!target)
                    await new Promise((resolve) => setTimeout(resolve, 50));
            }
            if (!target)
                throw new Error(
                    `Review control unavailable: ${step.selector}${step.text ? ` (${step.text})` : ""}`,
                );
            // Advance before actions that can navigate to another document.
            progress.index++;
            sessionStorage.setItem(storageKey, JSON.stringify(progress));
            if (step.action === "reload") {
                location.reload();
                return;
            }
            if (step.action === "click") target.click();
            if (step.action === "requests") {
                const response = await fetch("/__connect/review/requests", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(step.requests ?? []),
                });
                if (!response.ok)
                    throw new Error("Review request condition unavailable");
            }
            if (step.action === "fill") {
                // Comboboxes process typing only after receiving focus.
                target.focus();
                await new Promise((resolve) => setTimeout(resolve, 0));
                const prototype =
                    target instanceof HTMLTextAreaElement
                        ? HTMLTextAreaElement.prototype
                        : HTMLInputElement.prototype;
                Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
                    target,
                    step.value ?? "",
                );
                target.dispatchEvent(new Event("input", { bubbles: true }));
                target.dispatchEvent(new Event("change", { bubbles: true }));
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        document.documentElement.dataset.connectReviewComplete = "true";
    } catch (error) {
        sessionStorage.removeItem(storageKey);
        document.documentElement.dataset.connectReviewError =
            error instanceof Error ? error.message : "Control unavailable";
    } finally {
        running = false;
    }
}
