import { useCallback, useEffect, useState } from "react";

const useEasterEgg = () => {
    const [clickCount, setClickCount] = useState(0);
    const [showEasterEgg, setShowEasterEgg] = useState(false);
    const [showHint, setShowHint] = useState(false);

    // Show hint randomly on mount
    useEffect(() => {
        const shouldShowHint = Math.random() < 0.0; // 30% chance
        if (shouldShowHint) {
            setShowHint(true);
            const timer = setTimeout(() => setShowHint(false), 1000);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleLogoClick = useCallback(() => {
        setClickCount((prev) => {
            const newCount = prev + 1;

            if (newCount === 3) {
                setShowEasterEgg(true);
                return 0;
            }

            return newCount;
        });
    }, []);

    const closeEasterEgg = useCallback(() => {
        setShowEasterEgg(false);
        setClickCount(0);
    }, []);

    return {
        clickCount,
        showEasterEgg,
        showHint,
        handleLogoClick,
        closeEasterEgg,
        setShowHint,
    };
};

export default useEasterEgg;
