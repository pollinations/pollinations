import { Typography, Card, CardContent, GridList, GridListTile, IconButton,Button, GridListTileBar } from "@material-ui/core"
import Debug from "debug";

// Icons
import ListIcon from '@material-ui/icons/List';
import AppsIcon from '@material-ui/icons/Apps';
import { SEOImage } from "./Helmet";
import { any, identity } from "ramda";
import { getWebURL } from "../network/ipfsConnector";
const debug = Debug("ImageViewer");

const LinkStyle = {
  wordBreak: 'break-all',
  color: 'whitesmoke',
  padding: '10px 0'
}


const MediaDisplay = ({filename, ...props}) => 
  filename.toLowerCase().endsWith(".mp4") ? <video alt={filename} controls {...props} /> : <img alt={filename} {...props} />;

function ImageViewer({output, contentID}) {
    const images = getMedia(output);

    if (!images || images.length === 0)
      return null;

    const imgs = [...images]; imgs.reverse();

    const firstFilename = imgs[0][0];
    const firstURL = imgs[0][1];
    imgs.shift();

    debug("images", imgs);
    debug("first",firstFilename, firstURL)
    return (
        <div >
          <h3>Output [<Button style={LinkStyle}
                href={getWebURL(`${contentID}/output`)} 
                target="_blank">
                  Open Folder
            </Button>]</h3>
          <div style={{ width: '50%',maxWidth:'500px', margin: '20px auto' }}>
            <MediaDisplay src={firstURL} filename={firstFilename} style={{ width: '100%'}} />
            {firstFilename}
          </div>
            
          <GridList cellHeight={200} cols={4}
            children={imgs.map(([filename, url]) => (
              <GridListTile key={filename} cols={1}>
                <MediaDisplay src={url} filename={filename} style={{ margin:"5px", height:"100%" }} />
              </GridListTile>
            ))}/>

        </div>
    )
}

const _mediaTypeMap = {
  "all": [".jpg", ".png", ".mp4",".webm"],
  "video": [".mp4",".webm"],
  "image": [".jpg", ".png"]
}

function getMedia(output, type="all") {

  const extensions = _mediaTypeMap[type];

  const filterByExtensions = filename => 
    any(identity, extensions.map(ext => filename.toLowerCase().endsWith(ext)));

  const imageFilenames = output ? Object.keys(output)
    .filter(filterByExtensions) : [];

  const images = imageFilenames.map(filename => [filename, output[filename]]);

  return images
}

export const getCoverImage = output => output && getMedia(output, "image")[0];

export default ImageViewer;
