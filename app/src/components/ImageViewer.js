import { Typography, Card, CardContent, GridList, GridListTile, IconButton,Button } from "@material-ui/core"


// Icons
import ListIcon from '@material-ui/icons/List';
import AppsIcon from '@material-ui/icons/Apps';


function ImageViewer({images}) {
    let imgs = images?.reverse();

    return (
        <div >
          <div style={{ width: '50%', margin: '20px auto' }}>
          <img src={imgs[0]?.[1]} alt={imgs[0]?.[0]} style={{ width: '100%'}} />
          </div>
            
          <GridList cellHeight={200} cols={4}
            children={imgs.map(([filename, url]) => (
              <GridListTile key={filename} cols={1}>
                <img src={url} alt={filename} style={{ margin: 0 }} />
              </GridListTile>
            ))}/>

        </div>
    )
}

export default ImageViewer
