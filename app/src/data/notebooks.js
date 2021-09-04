import WallpaperIcon from '@material-ui/icons/Wallpaper';

import Debug from 'debug';

import { getIPFSState } from '../network/ipfsState';

const debug = Debug('notebooks');

// get list of notebooks from IPNS path
export const getNotebooks = async (ipfsPath="/ipns/k51qzi5uqu5dhpj5q7ya9le4ru112fzlx9x1jk2k68069wmuy6gps5i4nc8888") => {
  const ipfsNotebooks = await getIPFSState(ipfsPath, async ({cid}) => cid);
  debug('getNotebooks ipfs state', ipfsNotebooks);

  // filter out files that are not folders
  const notebooks = Object.entries(ipfsNotebooks)
    .filter(([_, value]) => typeof value !== "string")
    .map(([category,notebooks]) => 
      Object.entries(notebooks)
            .filter(([name, _]) => name.endsWith(".ipynb"))
            .map(([name,cid]) => ({
              category, 
              name: name.replace(".ipynb",""), 
              path:`/p/${cid}`, 
              Icon: WallpaperIcon
            }))
    )
    .flat();
  
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