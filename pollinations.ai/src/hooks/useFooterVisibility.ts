import { useEffect, useRef, useState } from "react";

export function useFooterVisibility(threshold = 100) {
    const [showFooter, setShowFooter] = useState(false);
    const lastScrollY = useRef(0);

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            const distanceFromBottom =
                documentHeight - (currentScrollY + windowHeight);

            // Show footer only when near bottom
            if (distanceFromBottom < threshold) {
                setShowFooter(true);
            } else {
                setShowFooter(false);
            }

            lastScrollY.current = currentScrollY;
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("resize", handleScroll, { passive: true });

        handleScroll();

        return () => {
            window.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleScroll);
        };
    }, [threshold]);

    return showFooter;
}
