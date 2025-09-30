import { useState, useEffect } from "react";

const SEED_RANGE = 5;
const DELAY_RANGE = 45000;
const useRandomSeed = () => {
    const [seed, setSeed] = useState(Math.floor(Math.random() * SEED_RANGE));

    useEffect(() => {
        let timeoutId;

        const changeSeed = () => {
            setSeed(Math.floor(Math.random() * SEED_RANGE));
            const now = new Date();
            const isWithinThreeMinutesAfterMidnight =
                now.getHours() === 0 && now.getMinutes() < 3;

            if (isWithinThreeMinutesAfterMidnight) {
                timeoutId = setTimeout(changeSeed, 1000);
            } else {
                const randomDelay = Math.floor(Math.random() * DELAY_RANGE);
                timeoutId = setTimeout(changeSeed, randomDelay);
            }
        };

        timeoutId = setTimeout(
            changeSeed,
            Math.floor(Math.random() * 10001) + 2000,
        );

        return () => clearTimeout(timeoutId);
    }, []);

    return seed;
};

export default useRandomSeed;
