import { useState, useEffect } from "react";

const useRandomSeed = () => {
    const [seed, setSeed] = useState(Math.floor(Math.random() * 10));

    useEffect(() => {
        const changeSeed = () => {
            setSeed(Math.floor(Math.random() * 10));
            const randomDelay = Math.floor(Math.random() * 100001) + 2000;
            setTimeout(changeSeed, randomDelay);
        };

        const timeoutId = setTimeout(changeSeed, Math.floor(Math.random() * 10001) + 2000);

        return () => clearTimeout(timeoutId);
    }, []);

    return seed;
};

export default useRandomSeed;