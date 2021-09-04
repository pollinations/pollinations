import WallpaperIcon from '@material-ui/icons/Wallpaper';
import { getIPFSState } from '../network/ipfsState';
import Debug from 'debug';

const debug = Debug('notebooks');

export const getNotebooks = async (ipfsPath="/ipns/k51qzi5uqu5dhpj5q7ya9le4ru112fzlx9x1jk2k68069wmuy6gps5i4nc8888") => {
  // debug("ipfs notebooks",await getIPFSState(ipfsPath));
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