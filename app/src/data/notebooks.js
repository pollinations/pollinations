import WallpaperIcon from '@material-ui/icons/Wallpaper';
import Debug from 'debug';
import readMetadata from '../utils/notebookMetadata';



const debug = Debug('notebooks');

// get list of notebooks from IPNS path
// this should be refactored once we cleaned the IFPS state code
// no need to do raw ipfs operations or data mangling here
export const getNotebooks = (ipfs) => {
  const ipfsState = ipfs;

  debug("ipfsState",ipfsState)
  if (!ipfsState) return null
  
  const notebookCategories = Object.keys(ipfsState);

  const allNotebooks = notebookCategories.map(category => {
    const notebooks = Object.entries(ipfsState[category]);
    debug('getNotebooks', category, notebooks);
  
    return notebooks.map(([name, notebookFolder]) => {
      const cid = notebookFolder[".cid"];
      debug("got cid for",name,notebookFolder,":", cid);
      const notebookJSON = notebookFolder["input"]["notebook.ipynb"]
      debug("getting metadata for", notebookJSON)
      const metadata = readMetadata(notebookJSON)
     
      if (!metadata) return null

      const { description } = metadata

      debug("notebookMetadata", name, description);
      return {
        category, 
        name, 
        path:`/p/${cid}/create`, 
        description,
        Icon: WallpaperIcon
      };
    }).filter(n => n !== null);
  }).flat();
  
  debug('getNotebooks parsed', allNotebooks);
  
  return allNotebooks;
}

