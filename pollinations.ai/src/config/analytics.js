import { analyticsService } from "../services/analyticsService";

export const trackEvent = analyticsService.trackEvent.bind(analyticsService);
