import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

it("keeps source access available without initializing vendor rules", async () => {
    vi.resetModules();
    const { PROVIDER_REGISTRY } = await import("../lib/providerRegistry");
    expect(PROVIDER_REGISTRY).toEqual([]);
    const { SourceRecovery } = await import("./SourceRecovery");
    const html = renderToStaticMarkup(
        createElement(SourceRecovery, { reason: "Invalid vendor journal" }),
    );
    expect(html).toContain("Invalid vendor journal");
    expect(html).toContain("Results and forecasts are unavailable");
    for (const name of ["Bank", "Vendor", "Pollen"])
        expect(html).toContain(`Download ${name} records`);
    expect(html).toContain("Retry journals");
    expect(PROVIDER_REGISTRY).toEqual([]);
});
