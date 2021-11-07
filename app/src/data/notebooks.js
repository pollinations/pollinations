import WallpaperIcon from '@material-ui/icons/Wallpaper';
import { useEffect, useState } from 'react';

import Debug from 'debug';
import { fetchAndMakeURL } from '../network/ipfsWebClient';
import readMetadata from '../utils/notebookMetadata';
import { getIPFSState } from '../network/ipfsState';
import { reader } from '../network/ipfsConnector';
import { parse } from 'json5';

const debug = Debug('notebooks');

const DEFAULT_HIVE_PATH = "/ipns/k51qzi5uqu5dhpj5q7ya9le4ru112fzlx9x1jk2k68069wmuy6gps5i4nc8888";

// get list of notebooks from IPNS path
// this should be refactored once we cleaned the IFPS state code
// no need to do raw ipfs operations or data mangling here
export const getNotebooks = async (ipfsPath=DEFAULT_HIVE_PATH) => {
  const { get } = reader();
  const ipfsState = await getIPFSState(ipfsPath);

  debug("ipfsState",ipfsState)

  const notebookCategories = Object.keys(ipfsState);

  const allNotebooks = await Promise.all(notebookCategories.map(category => {
    const notebooks = Object.entries(ipfsState[category]);
    debug('getNotebooks', category, notebooks);
  
    return notebooks.map(async ([name, notebookFolder]) => {
      const cid = notebookFolder[".cid"];
      debug("got cid for",name,notebookFolder,":", cid);
      const { json } = notebookFolder["input"]["notebook.ipynb"];
      const notebookJSON = await json();
      debug("getting metadata for", notebookJSON);
      const { description } = readMetadata(notebookJSON)
      debug("notebookMetadata", name, description);
      return {
        category, 
        name, 
        path:`/p/${cid}/`, 
        description,
        Icon: WallpaperIcon
      };
    });
  }).flat());
  
  debug('getNotebooks parsed', allNotebooks);
  
  return allNotebooks;
}

// react hook that fetches notebooks from IPNS and IPFS
export const useNotebooks = () => {
  const [notebooks, setNotebooks] = useState([]);


  useEffect(async () => {
    const loadNotebooks = async () => {
      const notebooks = await getNotebooks();
      setNotebooks(notebooks);
    };
    loadNotebooks();
  }, []);

  return notebooks;
}

