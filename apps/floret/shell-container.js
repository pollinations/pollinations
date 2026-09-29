import { Container, getContainer } from "@cloudflare/containers";
import {
    authenticateBearer,
    createShellOutbound,
    SHELL_CONTAINER_LIMITS,
} from "./shell-bridge.js";

export { authenticateBearer, createShellOutbound, SHELL_CONTAINER_LIMITS };

export class FloretShellContainer extends Container {
    defaultPort = 8080;
    enableInternet = true;
    sleepAfter = "10m";
}

export const shellOutbound = createShellOutbound({
    getContainerImpl: getContainer,
});

export function attachShellOutbound(FloretContainer) {
    FloretContainer.outboundByHost = {
        ...(FloretContainer.outboundByHost || {}),
        "floret-shell.internal": shellOutbound,
    };
}
