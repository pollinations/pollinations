import { Typography, Card, CardContent, GridList, GridListTile, IconButton,Button } from "@material-ui/core"


// Icons
import ListIcon from '@material-ui/icons/List';
import AppsIcon from '@material-ui/icons/Apps';


function ImageViewer({images}) {
    return (
        <div >
            
          <GridList cellHeight={200} cols={4}
            children={images?.slice().reverse().map(([filename, url]) => (
              <GridListTile key={filename} cols={1}>
                <img src={url} alt={filename} style={{ margin: 10 }} />
              </GridListTile>
            ))}/>

        </div>
    )
}

export default ImageViewer
