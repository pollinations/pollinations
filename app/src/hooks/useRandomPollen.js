import { getPollens } from '@pollinations/ipfs/ipfsWebClient';
import { useEffect } from "react";

import { useIsAdmin } from './useIsAdmin';

import Debug from "debug";

const debug = Debug("hooks/useRandomPollen");

export function useRandomPollen(nodeID, selectedModel, setNodeID) {
    const [isAdmin, _] = useIsAdmin();
    debug("isAdmin", isAdmin);
    useEffect(() => {
        if (!nodeID && selectedModel) {
            (async () => {
                debug("getting pollens for model", selectedModel);
                let pollens = await getPollens({ image: selectedModel, success: true, example: isAdmin && false ? false : true });

                // if (pollens.length === 0) {
                //     pollens = await getPollens({ image: selectedModel.key, success: true});
                // }
                if (pollens && pollens.length > 0) {
                    // select random pollen
                    const { input } = pollens[Math.floor(Math.random() * pollens.length)];
                    setNodeID(input);
                    debug("setting nodeID", input);
                }
            })();
        }
    }, [nodeID, selectedModel]);


}
