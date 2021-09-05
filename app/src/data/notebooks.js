import WallpaperIcon from '@material-ui/icons/Wallpaper';
import { useEffect, useState } from 'react';
import { ipfsGet, ipfsLs, ipfsResolve } from '../network/ipfsConnector';
import Debug from 'debug';
import { fetchAndMakeURL } from '../network/ipfsClient';
import readMetadata from '../utils/notebookMetadata';

const debug = Debug('notebooks');

// get list of notebooks from IPNS path
// this should be refactored once we cleaned the IFPS state code
// no need to do raw ipfs operations or data mangling here
export const getNotebooks = async (ipfsPath="/ipns/k51qzi5uqu5dhpj5q7ya9le4ru112fzlx9x1jk2k68069wmuy6gps5i4nc8888") => {
  const cid = await ipfsResolve(ipfsPath);

  const notebookCategories = await ipfsLs(cid);

  const notebooksPromise = Promise.all(notebookCategories.map(async ({name:category, cid:categoryCid}) => {
    const notebooks = await ipfsLs(categoryCid);
    debug('getNotebooks', category, notebooks);
  
    return await Promise.all(notebooks.map(async ({name,cid}) => {
      debug("cid",cid);
      const notebookJSON = await fetchAndMakeURL({ name:"notebook.ipynb", cid:`${cid}/input/notebook.ipynb`});
      const {description} = readMetadata(notebookJSON)
      // debug("notebookMetadata", description);
      
      return {
        category, 
        name, 
        path:`/p/${cid}`, 
        description,
        Icon: WallpaperIcon
      };
    }));
  }));
  const notebooks = (await notebooksPromise).flat();

  debug('getNotebooks parsed', notebooks);
  
  return notebooks;
}

export const getDefaultNotebook = async () => (await getNotebooks())[0];

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

const getNotebookData = async ({name,cid}) => { 

  const notebookJSON = ipfsGet(cid);
  debug("notebookJSON", notebookJSON);
  return {
    category, 
    name, 
    path:`/p/${cid}`, 
    Icon: WallpaperIcon
  };
}
