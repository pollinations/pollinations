import { reviewConditions } from "./conditions-data";
import type { ReviewCase } from "./review-cases";

// One sequence for captures and explicit Journey restarts. Only Flow's
// isolated fixture account is reset; Enter/Gen still execute the real flow.
export async function prepareReviewCase(
    recipe: ReviewCase,
    post: (path: string, body?: unknown) => Promise<Response>,
) {
    async function apply(path: string, body?: unknown) {
        const response = await post(`/__flow/${path}`, body);
        // The caller needs cookie headers, never the fixture response body.
        await response.body?.cancel();
        if (!response.ok)
            throw new Error(`Couldn’t prepare ${path}. Please try again.`);
        return response;
    }
    await apply("reset");
    const session = await apply("conditions", reviewConditions(recipe));
    await apply("review/prepare", recipe.prepare ?? {});
    const outcome =
        recipe.action?.type === "sign-in" ? recipe.action.outcome : undefined;
    await apply("outcome", {
        signIn:
            outcome === "error"
                ? "fail-start"
                : outcome === "provider-error"
                  ? "fail-next"
                  : "normal",
    });
    await apply("review/requests", [
        ...(recipe.requests ?? []),
        ...(outcome === "pending"
            ? [
                  {
                      path: "/api/auth/sign-in/social",
                      method: "POST",
                      outcome: "pending",
                  },
              ]
            : []),
    ]);
    return session;
}
