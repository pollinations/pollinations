import { useState, useEffect } from "react";

const useRandomSeed = () => {
    const [seed, setSeed] = useState(Math.floor(Math.random() * 10));

    useEffect(() => {
        let timeoutId;

        const changeSeed = () => {
            setSeed(Math.floor(Math.random() * 10));
            const randomDelay = Math.floor(Math.random() * 25001) + 2000;
            timeoutId = setTimeout(changeSeed, randomDelay);
        };

        timeoutId = setTimeout(changeSeed, Math.floor(Math.random() * 10001) + 2000);

        return () => clearTimeout(timeoutId);
    }, []);

    return seed;
};

export default useRandomSeed;