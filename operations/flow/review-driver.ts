import type { ReviewCase } from "./review-cases";
import type { ReviewRequest } from "./review-requests";
export type ReviewStep = {
    selector: string;
    text?: string;
    action: "click" | "fill" | "wait" | "reload" | "requests";
    value?: string;
    requests?: ReviewRequest[];
};

// Both Journey and captures click the same real controls. The external-provider
// handoff remains an explicit page; capture automation continues it separately.
export function initialReviewSteps(recipe: ReviewCase): ReviewStep[] {
    const steps: ReviewStep[] = [];
    if (recipe.action?.type === "sign-in") {
        steps.push({
            selector: "button",
            text: "Sign in with GitHub",
            action: "click",
        });
    }
    if (recipe.action?.type === "device-deny")
        steps.push({ selector: "button", text: "Decline", action: "click" });
    return [...steps, ...(recipe.steps ?? [])];
}
export function isReviewControlVisible(element: HTMLElement) {
    return (
        element.checkVisibility({
            visibilityProperty: true,
            opacityProperty: true,
        }) && !element.closest('[inert], [aria-hidden="true"]')
    );
}
const storageKey = "flow:review-steps";
export function clearReviewSteps() {
    sessionStorage.removeItem(storageKey);
}
export function queueReviewSteps(steps: ReviewStep[]) {
    sessionStorage.setItem(storageKey, JSON.stringify({ steps, index: 0 }));
}
let running = false;
type Progress = { steps: ReviewStep[]; index: number };

// Persist only the review actions, never credentials. Native redirects still
// belong to Enter and the SDK. Resume the same actions after those redirects.
export async function runReviewSteps(steps?: ReviewStep[]) {
    if (steps) queueReviewSteps(steps);
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
            if (step.action === "click") {
                // Wait for the control's first paint before input, as a browser
                // user would. Clicking during React's initial mount can race
                // the form effect that initializes its draft state.
                await new Promise<void>((resolve) =>
                    requestAnimationFrame(() =>
                        requestAnimationFrame(() => resolve()),
                    ),
                );
                target.click();
            }
            if (step.action === "requests") {
                const response = await fetch("/__flow/review/requests", {
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
        document.documentElement.dataset.flowReviewComplete = "true";
    } catch (error) {
        sessionStorage.removeItem(storageKey);
        document.documentElement.dataset.flowReviewError =
            error instanceof Error ? error.message : "Control unavailable";
    } finally {
        running = false;
    }
}
