import { type RefObject, useEffect, useState } from "react";

/** Whether the element is on screen; with `once`, stays true after the first time. */
export function useInView(
    ref: RefObject<Element | null>,
    {
        once = false,
        threshold = 0,
    }: { once?: boolean; threshold?: number } = {},
) {
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                setInView(entry.isIntersecting);
                if (once && entry.isIntersecting) observer.disconnect();
            },
            { threshold },
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref, once, threshold]);

    return inView;
}
