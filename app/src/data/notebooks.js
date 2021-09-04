import WallpaperIcon from '@material-ui/icons/Wallpaper';

import Debug from 'debug';
import { ipfsLs, ipfsResolve } from '../network/ipfsConnector';

import { getIPFSState } from '../network/ipfsState';

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
 
const notebooks = [
  {
    name: "CLIP-guided VQGan HQ",
    path: "/p/QmPvWkYmLgHXGEhcrTy7BLj42PEMuZSVdf5K5JKdi8Ch3f",
    category: "Text-to-Image",
    Icon: WallpaperIcon
  },
  {
    name: "PixelDraw",
    path: "/p/QmZy8RzwsnfTvRsPZ9ifGchF2L317mienHsS4WDCP576rs",
    category: "Text-to-Image",
    Icon: WallpaperIcon
  },
  {
    name: "CLIP-guided Diffusion",
    path: "/p/QmTBUAGsqWzJsF1Ccuzk9W5STkzGa8bK6QcPpj7JrT4a6J",
    category: "Text-to-Image",
    Icon: WallpaperIcon
 }, 
  {
      name: "DALL-E Mini",
      path: "/p/QmQBzUpwF21ynVfSU3tW2WiWZfNjS94aq58verfghDLpWV",
      category: "Text-to-Image",
      Icon: WallpaperIcon
  }
];