import { OutageNotice, useOnline } from "@pollinations/ui";
import { useOutage, useRequestTimeout } from "../../lib/outage.ts";

/**
 * While an Enter or gen call fails, one notice at the top of the page. As the
 * topmost notice it gives the full message; panels below keep theirs short.
 * When every failure is a timeout, the panels say the data took too long
 * instead, so there is no outage to announce. It promises no retry: the
 * failed call may have been a save, which nothing retries.
 */
export function OutageBanner() {
    const outage = useOutage();
    const timeoutOnly = useRequestTimeout();
    const online = useOnline();
    return outage && (!timeoutOnly || !online) ? <OutageNotice /> : null;
}
