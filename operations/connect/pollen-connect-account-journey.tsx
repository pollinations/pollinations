import { accountActionScreens } from "./pollen-connect-account-actions";
import { adminScreens } from "./pollen-connect-admin";
import {
    type DashboardSection,
    dashboardSectionForScreen,
    getDashboardFlow,
} from "./pollen-connect-dashboard";
import type { JourneyLocation } from "./pollen-connect-journey-state";
import { reviewScreen } from "./review";
import type { ReviewCase } from "./review-cases";
import { RuntimeJourney } from "./runtime-journey";

export function AccountJourney({
    desktop,
    onLocationChange,
    onOpenDashboard,
    dashboard,
    admin = false,
    onDashboardNavigate,
    revision = 0,
    reviewCase,
}: {
    dashboard?: DashboardSection;
    admin?: boolean;
    onDashboardNavigate?: (section: DashboardSection) => void;
    revision?: number;
    reviewCase?: ReviewCase;
    desktop: boolean;
    onLocationChange: (location: JourneyLocation) => void;
    onOpenDashboard: () => void;
}) {
    const inventory = admin
        ? adminScreens
        : dashboard
          ? getDashboardFlow(dashboard).screens
          : accountActionScreens;
    const initialEntry = reviewCase
        ? reviewScreen(reviewCase, inventory)
        : inventory[0];
    return (
        <section
            className="account-action-journey"
            data-preview-size={desktop ? "desktop" : "mobile"}
        >
            <RuntimeJourney
                entry={initialEntry}
                inventory={inventory}
                world={admin ? "admin" : dashboard ? "account" : "topup"}
                revision={revision}
                desktop={desktop}
                onLocationChange={onLocationChange}
                onOpenDashboard={onOpenDashboard}
                onReport={(screen) => {
                    if (dashboard)
                        onDashboardNavigate?.(
                            dashboardSectionForScreen(screen.node),
                        );
                }}
            />
        </section>
    );
}
