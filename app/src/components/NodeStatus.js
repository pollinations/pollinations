import { displayContentID } from "../network/utils";
import { getWebURL } from "../network/ipfsConnector";
import { Button, Link, ListItem as MuiListItem, Table, TableRow, TableBody, TableCell as MuiTableCell, withStyles, styled} from "@material-ui/core"

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

/* <List style={{marginLeft:"auto"}}>
            <ListItem>
                <Typography>Status</Typography>
            </ListItem>
            <ListItem>
                <Typography component="span">[{status}, {colabState}]</Typography>
            </ListItem>
            </List> */

export default ({ nodeID, contentID, status, ipfs }) => {
    const colabState = ipfs?.output?.status;
    return <Table size="small" aria-label="a dense table" style={{width:"210px", marginLeft:"auto"}}>
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
                </Table>;
}


function ColabConnectButton() {
    return <Button color="secondary" href={colabURL} variant="outlined" target="_blank">Launch</Button>
}
