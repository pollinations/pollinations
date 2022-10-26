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

  const allNotebooks = notebookCategories.filter(c => c !== ".cid").map(category => {
    const notebooks = Object.entries(ipfsState[category]);
    debug('getNotebooks', category, notebooks);
  
    return notebooks.filter(([name,]) => name !== ".cid").map(async ([name, notebookFolder]) => {
      const cid = notebookFolder[".cid"];
      debug("got cid for",name,notebookFolder,":", cid);
      const notebookURL = notebookFolder["input"]["notebook.ipynb"]

      // get notebookJSON from url
      const response = await fetch(notebookURL);
      const notebookJSON = await response.json();

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
    });
  }).flat()
  
  ;
  
  debug('getNotebooks parsed', allNotebooks);
  
  return Promise.all(allNotebooks);
}

