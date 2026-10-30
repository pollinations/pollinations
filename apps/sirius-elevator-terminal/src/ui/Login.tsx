// Device-login screen. Shows the user code + verification URL, opens the
// browser, and polls until the user approves (or denies / it expires).

import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import open from "open";
import { useEffect, useRef, useState } from "react";
import {
    type DeviceCode,
    pollForToken,
    requestDeviceCode,
    storeApiKey,
} from "../auth.js";

type LoginProps = { onAuthenticated: (apiKey: string) => void };

type Phase = "starting" | "waiting" | "error";

export function Login({ onAuthenticated }: LoginProps) {
    const { exit } = useApp();
    const [phase, setPhase] = useState<Phase>("starting");
    const [device, setDevice] = useState<DeviceCode | null>(null);
    const [error, setError] = useState<string | null>(null);
    const cancelled = useRef(false);

    useInput((input, key) => {
        if (key.escape || input === "q" || (key.ctrl && input === "c")) {
            cancelled.current = true;
            exit();
        }
    });

    useEffect(() => {
        cancelled.current = false;

        (async () => {
            let dev: DeviceCode;
            try {
                dev = await requestDeviceCode();
            } catch (e) {
                setError((e as Error).message);
                setPhase("error");
                return;
            }
            if (cancelled.current) return;
            setDevice(dev);
            setPhase("waiting");

            // Best-effort: open the browser straight to the pre-filled code.
            open(dev.verification_uri_complete).catch(() => {});

            // Poll until approved / denied / expired.
            const deadline = Date.now() + dev.expires_in * 1000;
            while (!cancelled.current && Date.now() < deadline) {
                await new Promise((r) =>
                    setTimeout(r, Math.max(1, dev.interval) * 1000),
                );
                if (cancelled.current) return;

                const result = await pollForToken(dev.device_code).catch(
                    () => ({ status: "pending" as const }),
                );
                if (result.status === "approved") {
                    await storeApiKey(result.apiKey);
                    if (!cancelled.current) onAuthenticated(result.apiKey);
                    return;
                }
                if (result.status === "denied") {
                    setError("Access denied. Run again to retry.");
                    setPhase("error");
                    return;
                }
                if (result.status === "expired") {
                    setError("The code expired. Run again to retry.");
                    setPhase("error");
                    return;
                }
            }
            if (!cancelled.current) {
                setError("Login timed out. Run again to retry.");
                setPhase("error");
            }
        })();

        return () => {
            cancelled.current = true;
        };
    }, [onAuthenticated]);

    return (
        <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="cyan"
            paddingX={2}
            paddingY={1}
        >
            <Text bold color="cyan">
                🛗 Sirius Cybernetics Elevator Challenge
            </Text>
            <Text dimColor>Bring Your Own Pollen — sign in to play.</Text>
            <Box marginTop={1} flexDirection="column">
                {phase === "starting" && (
                    <Text>
                        <Text color="cyan">
                            <Spinner type="dots" />
                        </Text>{" "}
                        Contacting enter.pollinations.ai…
                    </Text>
                )}

                {phase === "waiting" && device && (
                    <>
                        <Text>1. A browser window should have opened.</Text>
                        <Text>
                            {"   "}If not, visit:{" "}
                            <Text color="cyan" underline>
                                {device.verification_uri}
                            </Text>
                        </Text>
                        <Box marginY={1}>
                            <Text>2. Enter this code: </Text>
                            <Text bold color="yellow" backgroundColor="black">
                                {" "}
                                {device.user_code}{" "}
                            </Text>
                        </Box>
                        <Text>
                            <Text color="green">
                                <Spinner type="dots" />
                            </Text>{" "}
                            Waiting for you to approve…
                        </Text>
                    </>
                )}

                {phase === "error" && <Text color="red">✖ {error}</Text>}
            </Box>
            <Box marginTop={1}>
                <Text dimColor>Press q or Esc to quit.</Text>
            </Box>
        </Box>
    );
}
