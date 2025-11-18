import { useState, useEffect } from "react";

export function useFooterVisibility(threshold = 100) {
    const [showFooter, setShowFooter] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            const scrollTop = window.scrollY;
            const distanceFromBottom =
                documentHeight - (scrollTop + windowHeight);

            // Show footer when near bottom OR if page is short (no scroll needed)
            if (
                distanceFromBottom < threshold ||
                documentHeight <= windowHeight
            ) {
                setShowFooter(true);
            } else {
                setShowFooter(false);
            }
        };

        const handleMouseMove = (e) => {
            const windowHeight = window.innerHeight;
            const mouseY = e.clientY;
            const distanceFromBottom = windowHeight - mouseY;

            // Show footer when mouse is within threshold of bottom
            if (distanceFromBottom < threshold) {
                setShowFooter(true);
            }
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("resize", handleScroll, { passive: true });
        window.addEventListener("mousemove", handleMouseMove, {
            passive: true,
        });

        // Check immediately on mount
        handleScroll();

        return () => {
            window.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleScroll);
            window.removeEventListener("mousemove", handleMouseMove);
        };
    }, [threshold]);

    return showFooter;
}
