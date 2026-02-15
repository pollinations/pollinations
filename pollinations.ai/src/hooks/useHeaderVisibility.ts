import { useEffect, useRef, useState } from "react";

export function useHeaderVisibility(threshold = 10) {
    const [showHeader, setShowHeader] = useState(true);
    const lastScrollY = useRef(0);

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;

            // Show header only at the very top
            if (currentScrollY < threshold) {
                setShowHeader(true);
            } else {
                // Hide as soon as we scroll down from top
                setShowHeader(false);
            }

            lastScrollY.current = currentScrollY;
        };

        window.addEventListener("scroll", handleScroll, { passive: true });

        return () => {
            window.removeEventListener("scroll", handleScroll);
        };
    }, [threshold]);

    return showHeader;
}
