import { PolliProvider, useAuthState } from "@pollinations/sdk/react";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import type { ApiReferenceConfiguration } from "@scalar/hono-api-reference";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

declare global {
    interface Window {
        pollinationsDocsConfiguration: ApiReferenceConfiguration;
        Scalar: {
            createApiReference: (
                selector: string,
                configuration: ApiReferenceConfiguration,
            ) => {
                destroy: () => void;
            };
        };
    }
}

let reference: ReturnType<typeof window.Scalar.createApiReference> | undefined;

function DocsConnection({ canConnect }: { canConnect: boolean }) {
    const { apiKey, isHydrated, error } = useAuthState();
    const [requests, setRequests] = useState(0);

    useEffect(() => {
        if (!isHydrated) return;
        const configuration = {
            ...window.pollinationsDocsConfiguration,
            persistAuth: false,
            authentication: {
                preferredSecurityScheme: "bearerAuth",
                securitySchemes: { bearerAuth: { token: apiKey ?? "" } },
            },
            onResponseReceived: () => setRequests((count) => count + 1),
        };
        // Scalar's manually edited credentials take precedence over config.
        // Recreate on key changes so disconnect also clears those credentials.
        reference?.destroy();
        reference = window.Scalar.createApiReference("#app", configuration);
    }, [apiKey, isHydrated]);

    return (
        <>
            {canConnect && (
                <AppUserMenu
                    key={requests}
                    labels={{ authorize: "Connect Pollinations" }}
                />
            )}
            {error && (
                <p className="ph-docs-auth-error" role="alert">
                    Could not connect. Please try again.
                </p>
            )}
        </>
    );
}

const container = document.getElementById("ph-docs-account");
if (container) {
    createRoot(container).render(
        <PolliProvider
            appKey={container.dataset.appKey ?? ""}
            enterUrl={container.dataset.enterUrl}
            apiBaseUrl={window.location.origin}
            storage="sessionStorage"
            budget={5}
            expiry={7}
        >
            <DocsConnection canConnect={Boolean(container.dataset.appKey)} />
        </PolliProvider>,
    );
}
