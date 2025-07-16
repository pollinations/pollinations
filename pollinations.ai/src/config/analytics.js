export function trackEvent({ action, category, label, value }) {
    if (typeof window !== "undefined" && window.gtag) {
        window.gtag("event", action, {
            category,
            label,
            value,
        });
    }
}
