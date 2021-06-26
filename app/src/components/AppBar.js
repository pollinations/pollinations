import { displayContentID } from "../network/utils";
import { getWebURL } from "../network/ipfsConnector";
import Acordion from './Acordion'
import { Button, Link, Typography, AppBar, Toolbar, IconButton, List, ListItem as MuiListItem, Paper, TableContainer, Table, TableHead, TableRow, TableBody, TableCell as MuiTableCell, withStyles, styled} from "@material-ui/core"
import ExpandMore from "@material-ui/icons/ExpandMore";
import MenuIcon from "@material-ui/icons/Menu";
import NodeStatus from "./NodeStatus";

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

export default (props) => {
    const colabState = ipfs?.output?.status;
    return <AppBar position="static">
        <Toolbar>
         <IconButton edge="start" color="inherit" aria-label="menu">
            <MenuIcon />
         </IconButton>
            <NodeStatus {...props} />
        </Toolbar>

    </AppBar>
}


function ColabConnectButton() {
    return <Button color="secondary" href={colabURL} variant="outlined" target="_blank">Launch</Button>
}
