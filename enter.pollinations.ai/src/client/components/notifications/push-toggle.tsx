import { useEffect, useState } from "react";
import { Button } from "../button.tsx";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
        arr[i] = raw.charCodeAt(i);
    }
    return arr.buffer as ArrayBuffer;
}

type Status = "loading" | "unsupported" | "denied" | "enabled" | "disabled";

export function PushNotificationToggle() {
    const [status, setStatus] = useState<Status>("loading");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
            setStatus("unsupported");
            return;
        }
        if (Notification.permission === "denied") {
            setStatus("denied");
            return;
        }

        // Check if already subscribed
        navigator.serviceWorker.ready.then((reg) => {
            reg.pushManager.getSubscription().then((sub) => {
                setStatus(sub ? "enabled" : "disabled");
            });
        });
    }, []);

    async function toggle() {
        setBusy(true);
        try {
            if (status === "enabled") {
                await unsubscribe();
            } else {
                await subscribe();
            }
        } finally {
            setBusy(false);
        }
    }

    async function subscribe() {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
            setStatus("denied");
            return;
        }

        // Get VAPID public key from server
        const statusRes = await fetch("/api/notifications/status", {
            credentials: "include",
        });
        const data: { vapidPublicKey: string | null } = await statusRes.json();
        if (!data.vapidPublicKey) return;

        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(data.vapidPublicKey),
        });

        await fetch("/api/notifications/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(sub.toJSON()),
        });

        setStatus("enabled");
    }

    async function unsubscribe() {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
            await fetch("/api/notifications/unsubscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ endpoint: sub.endpoint }),
            });
            await sub.unsubscribe();
        }
        setStatus("disabled");
    }

    if (status === "loading" || status === "unsupported") return null;

    return (
        <Button
            as="button"
            color={status === "enabled" ? "green" : "dark"}
            weight="light"
            onClick={toggle}
            disabled={busy || status === "denied"}
            className="flex items-center gap-1.5 text-sm"
        >
            <span>{status === "enabled" ? "🔔" : "🔕"}</span>
            {status === "denied"
                ? "Notifications blocked"
                : busy
                  ? "..."
                  : status === "enabled"
                    ? "Notifications on"
                    : "Enable notifications"}
        </Button>
    );
}
