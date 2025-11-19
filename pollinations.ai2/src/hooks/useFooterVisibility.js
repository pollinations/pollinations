import { useState, useEffect, useRef } from "react";

export function useFooterVisibility(threshold = 100) {
    const [showFooter, setShowFooter] = useState(false);
    const lastScrollY = useRef(0);

    useEffect(() => {
        const isMobile = window.innerWidth < 768;

        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            const distanceFromBottom =
                documentHeight - (currentScrollY + windowHeight);

            if (isMobile) {
                // Mobile: Show only at bottom, hide on scroll up
                if (distanceFromBottom < threshold) {
                    setShowFooter(true);
                } else {
                    setShowFooter(false);
                }
            } else {
                // Desktop: Original smart behavior
                if (
                    distanceFromBottom < threshold ||
                    documentHeight <= windowHeight
                ) {
                    setShowFooter(true);
                } else {
                    setShowFooter(false);
                }
            }

            lastScrollY.current = currentScrollY;
        };

        const handleMouseMove = (e) => {
            if (isMobile) return; // Skip mouse events on mobile

            const windowHeight = window.innerHeight;
            const mouseY = e.clientY;
            const distanceFromBottom = windowHeight - mouseY;

            if (distanceFromBottom < threshold) {
                setShowFooter(true);
            }
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("resize", handleScroll, { passive: true });
        if (!isMobile) {
            window.addEventListener("mousemove", handleMouseMove, {
                passive: true,
            });
        }

        handleScroll();

        return () => {
            window.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleScroll);
            if (!isMobile) {
                window.removeEventListener("mousemove", handleMouseMove);
            }
        };
    }, [threshold]);

    return showFooter;
}
