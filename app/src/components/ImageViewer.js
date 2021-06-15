import { Typography, Card, CardContent, GridList, GridListTile, IconButton,Button, GridListTileBar } from "@material-ui/core"
import Debug from "debug";

// Icons
import ListIcon from '@material-ui/icons/List';
import AppsIcon from '@material-ui/icons/Apps';

const debug = Debug("ImageViewer");

const MediaDisplay = ({filename, ...props}) => 
  filename.toLowerCase().endsWith(".mp4") ? <video {...props} controls /> : <img {...props} />;

function ImageViewer({images}) {

    if (!images || images.length === 0)
      return null;

    const imgs = [...images]; imgs.reverse();

    debug("images", imgs);

    const firstFilename = imgs[0][0];
    const firstURL = imgs[0][1]
    debug("first",firstFilename, firstURL)
    return (
        <div >
          <div style={{ width: '50%',maxWidth:'500px', margin: '20px auto' }}>
            <MediaDisplay src={firstURL} filename={firstFilename} alt={firstFilename} style={{ width: '100%'}} />
            {firstFilename}
          </div>
            
          <GridList cellHeight={200} cols={4}
            children={imgs.map(([filename, url]) => (
              <GridListTile key={filename} cols={1}>
                <MediaDisplay src={url} filename={filename} alt={filename} style={{ margin: 0 }} />
                <GridListTileBar title={filename} />
              </GridListTile>
            ))}/>

        </div>
    )
}

export default ImageViewer
