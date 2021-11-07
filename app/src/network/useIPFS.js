
import {useCallback, useEffect, useMemo, useReducer, useState} from "react";

 
import {IPFSWebState} from "./ipfsWebClient";
import Debug from "debug";



const debug = Debug("useIPFS");

const useIPFS = (contentID) => {
    const [ipfs, setIpfsState] = useState({});

    debug("ipfs state", ipfs); 

    useEffect( () => {
        
        debug("setContentID", contentID);

        if (contentID) {
            debug("dispatching new contentID",contentID);

            IPFSWebState(contentID)
                .then(setIpfsState);
        }
    }, [ contentID ]);

    return ipfs;
};



export default useIPFS;


