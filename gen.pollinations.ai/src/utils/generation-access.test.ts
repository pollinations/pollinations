import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vitest";
import { requireGenerationAccess } from "./generation-access.ts";

type AccessVariables = Parameters<typeof requireGenerationAccess>[0];

function createVariables({
    priceMultiplier,
    authenticated = false,
}: {
    priceMultiplier: number;
    authenticated?: boolean;
}) {
    const requireAuthorization = vi.fn(async () => {
        if (!authenticated) throw new HTTPException(401);
    });
    const requireModelAccess = vi.fn();
    const getBalance = vi.fn(async () => {
        throw new Error("balance must not be checked");
    });

    const vars = {
        auth: {
            user: authenticated ? { id: "user-id" } : undefined,
            apiKey: authenticated
                ? { id: "key-id", pollenBalance: 0 }
                : undefined,
            requireAuthorization,
            requireUser: () => {
                throw new Error("not used");
            },
            requireModelAccess,
        },
        balance: { getBalance },
        model: {
            requested: "test-model",
            resolved: "test-model",
            definition: { priceMultiplier },
        },
        log: {},
    } as unknown as AccessVariables;

    return { vars, requireAuthorization, requireModelAccess, getBalance };
}

describe("generation access", () => {
    it("allows an unauthenticated request to an explicitly free model", async () => {
        const access = createVariables({ priceMultiplier: 0 });

        await requireGenerationAccess(access.vars, {} as CloudflareBindings);

        expect(access.requireAuthorization).not.toHaveBeenCalled();
        expect(access.requireModelAccess).toHaveBeenCalledOnce();
        expect(access.getBalance).not.toHaveBeenCalled();
    });

    it("allows an authenticated request to a free model without checking budget or balance", async () => {
        const access = createVariables({
            priceMultiplier: 0,
            authenticated: true,
        });

        await requireGenerationAccess(access.vars, {} as CloudflareBindings);

        expect(access.requireAuthorization).not.toHaveBeenCalled();
        expect(access.requireModelAccess).toHaveBeenCalledOnce();
        expect(access.getBalance).not.toHaveBeenCalled();
    });

    it("enforces model permissions for an authenticated free request", async () => {
        const access = createVariables({
            priceMultiplier: 0,
            authenticated: true,
        });
        access.requireModelAccess.mockImplementation(() => {
            throw new HTTPException(403);
        });

        await expect(
            requireGenerationAccess(access.vars, {} as CloudflareBindings),
        ).rejects.toMatchObject({ status: 403 });
        expect(access.getBalance).not.toHaveBeenCalled();
    });

    it("still requires authentication for a paid model", async () => {
        const access = createVariables({ priceMultiplier: 1 });

        await expect(
            requireGenerationAccess(access.vars, {} as CloudflareBindings),
        ).rejects.toMatchObject({ status: 401 });
        expect(access.getBalance).not.toHaveBeenCalled();
    });
});
