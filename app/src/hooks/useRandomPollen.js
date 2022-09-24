import { getPollens } from '@pollinations/ipfs/awsPollenRunner';
import { useEffect } from "react";

import { useIsAdmin } from './useIsAdmin';

import Debug from "debug";

const debug = Debug("hooks/useRandomPollen");

export function useRandomPollen(nodeID, selectedModel, setNodeID) {
    const [isAdmin, _] = useIsAdmin();
    debug("isAdmin", isAdmin);
    useEffect(() => {
        if (!nodeID && selectedModel.key) {
            (async () => {
                debug("getting pollens for model", selectedModel.key);
                let pollens = await getPollens({ image: selectedModel.key, success: true, example: isAdmin ? false : true });

                // if (pollens.length === 0) {
                //     pollens = await getPollens({ image: selectedModel.key, success: true});
                // }
                if (pollens.length > 0) {
                    // select random pollen
                    const { input } = pollens[Math.floor(Math.random() * pollens.length)];
                    setNodeID(input);
                }
            })();
        }
    }, [nodeID, selectedModel]);


}
