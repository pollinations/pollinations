import { useEffect, useState } from "react";
import { LAYOUT } from "../../../copy/content/layout";

interface BackToTopProps {
    targetId?: string;
    hideWhenId?: string;
}

export function BackToTop({ targetId, hideWhenId }: BackToTopProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const onScroll = () => setVisible(window.scrollY > 900);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        if (!hideWhenId) return;
        const el = document.getElementById(hideWhenId);
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) setVisible(false);
            },
            { rootMargin: "0px 0px -80% 0px" },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [hideWhenId]);

    const handleClick = () => {
        if (targetId) {
            document
                .getElementById(targetId)
                ?.scrollIntoView({ behavior: "smooth" });
        } else {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            className={`fixed z-50 font-headline text-xs font-black uppercase tracking-wider px-3 py-2 bg-white text-dark border-2 border-dark border-r-4 border-b-4 shadow-dark-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 ${visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        >
            {LAYOUT.backToTop}
        </button>
    );
}
