import { displayContentID } from "../network/utils";
import { getWebURL } from "../network/ipfsConnector";
import Acordion from './Acordion'
import { Button, Link, Typography, AppBar, Toolbar, IconButton, List, ListItem as MuiListItem, Paper, TableContainer, Table, TableHead, TableRow, TableBody, TableCell as MuiTableCell, withStyles, styled} from "@material-ui/core"
import ExpandMore from "@material-ui/icons/ExpandMore";
import MenuIcon from "@material-ui/icons/Menu";

const colabURL = "https://colab.research.google.com/github/voodoohop/pollinations/blob/dev/colabs/pollinator.ipynb";

const TableCell = withStyles({
    root: {
      borderBottom: "none"
    }
  })(MuiTableCell);

const ListItem = styled(MuiListItem)({
      margin: "0px",
      padding:"4px",
      textAlign:"right"
  });

//     <Typography variant="h6" >
//       News
//     </Typography>
//     <Button color="inherit">Login</Button>
//   </Toolbar>
// </AppBar>

export default ({ nodeID, contentID, status, ipfs }) => {
    const colabState = ipfs?.output?.status;
    return <AppBar position="static">
        <Toolbar>
         <IconButton edge="start" color="inherit" aria-label="menu">
            <MenuIcon />
         </IconButton>
         {/* <List style={{marginLeft:"auto"}}>
            <ListItem>
                <Typography>Status</Typography>
            </ListItem>
            <ListItem>
                <Typography component="span">[{status}, {colabState}]</Typography>
            </ListItem>
            </List> */}
                <Table size="small" aria-label="a dense table" style={{width:"210px", marginLeft:"auto"}}>
                    <TableBody>
                        <TableRow>
                            <TableCell style={{paddingRight: "0px"}}>Node</TableCell>
                            <TableCell>{nodeID ? <Link >{displayContentID(nodeID)}</Link> : <ColabConnectButton />}</TableCell>
                        </TableRow>
                        <TableRow>
                        <TableCell style={{paddingRight: "0px"}}>Content</TableCell>
                            <TableCell>{contentID ?
                                <Link
                                    href={getWebURL(contentID)} children={displayContentID(contentID)}
                                    target="_blank"
                                />
                                : <p children="Not connected..." />}
                        </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
        </Toolbar>

    </AppBar>
}


function ColabConnectButton() {
    return <Button color="secondary" href={colabURL} variant="outlined" target="_blank">Launch</Button>
}
