import WallpaperIcon from '@material-ui/icons/Wallpaper';
import { useEffect, useState } from 'react';
import { ipfsLs, ipfsResolve } from '../network/ipfsConnector';
import Debug from 'debug';

const debug = Debug('notebooks');

// get list of notebooks from IPNS path
export const getNotebooks = async (ipfsPath="/ipns/k51qzi5uqu5dhpj5q7ya9le4ru112fzlx9x1jk2k68069wmuy6gps5i4nc8888") => {
  const cid = await ipfsResolve(ipfsPath);

  const notebookCategories = await ipfsLs(cid);

  const notebooksPromise = Promise.all(notebookCategories.map(async ({name:category, cid:categoryCid}) => {
    const notebooks = await ipfsLs(categoryCid);
    debug('getNotebooks', category, notebooks);
    return notebooks.map(({name,cid}) => ({
      category, 
      name, 
      path:`/p/${cid}`, 
      Icon: WallpaperIcon
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