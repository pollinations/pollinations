class AnalyticsService {
    trackEvent({ action, category, label, value }) {
        if (typeof window !== "undefined" && window.gtag) {
            window.gtag("event", action, {
                event_category: category,
                event_label: label,
                value: value,
            });
        }
    }

    // Add other analytics methods here as needed
    // For example:
    // trackPageView(url) { /* ... */ }
    // identifyUser(userId) { /* ... */ }
}

export const analyticsService = new AnalyticsService();