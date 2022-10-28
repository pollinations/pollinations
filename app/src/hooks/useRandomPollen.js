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
                const params = { image: selectedModel, success: true, example: isAdmin && false ? false : true }
                debug("getting pollens for params", params);
                let pollens = await getPollens(params);
                debug("pollens", pollens);
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
