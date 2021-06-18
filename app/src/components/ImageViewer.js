import { Typography, Card, CardContent, GridList, GridListTile, IconButton,Button, GridListTileBar } from "@material-ui/core"
import Debug from "debug";

// Icons
import ListIcon from '@material-ui/icons/List';
import AppsIcon from '@material-ui/icons/Apps';
import { SEOImage } from "./Helmet";
import { any, identity } from "ramda";
const debug = Debug("ImageViewer");

const MediaDisplay = ({filename, ...props}) => 
  filename.toLowerCase().endsWith(".mp4") ? <video alt={filename} controls {...props} /> : <img alt={filename} {...props} />;

function ImageViewer({output}) {
    const images = getPreviewImages(output);

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
          <SEOImage url={firstURL} />
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

function getPreviewImages(output) {
  const extensions = [".jpg", ".png", ".mp4"]

  const filterByExtensions = filename => 
    any(identity, extensions.map(ext => filename.endsWith(ext)));

  const imageFilenames = output ? Object.keys(output)
    .filter(filterByExtensions) : [];

  const images = imageFilenames.map(filename => [filename, output[filename]]);

  return images
}

export default ImageViewer
