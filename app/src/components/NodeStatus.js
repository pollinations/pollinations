import { displayContentID } from "../network/utils";
import { getIPNSURL, getWebURL } from "../network/ipfsConnector";
import { Button, Link, ListItem as MuiListItem, Table, TableRow, TableBody, TableCell as MuiTableCell, withStyles, styled, List, Typography, Box} from "@material-ui/core"
const colabURL = "https://colab.research.google.com/github/pollinations/pollinations/blob/dev/colabs/pollinator.ipynb";

const TableCell = withStyles({
    root: {
      borderBottom: "none",
      padding: "2px"
    }
  })(MuiTableCell);




export default ({ nodeID, contentID, status, ipfs }) => {
    const colabState = ipfs?.output?.status;
    return <Box style={{width:"220px", marginLeft:"auto"}}>
        <Table size="small" aria-label="a dense table" >
                    <TableBody>
                        <TableRow>
                            <TableCell><b>NodeID</b></TableCell>
                            <TableCell>{nodeID ? displayContentID(nodeID) : <ColabConnectButton />}</TableCell>
                        </TableRow>
                        <TableRow>
                        <TableCell ><b>ContentID</b></TableCell>
                            <TableCell>{contentID ?
                                <Link
                                    href={getWebURL(contentID)} children={displayContentID(contentID)}
                                    target="_blank"
                                />
                                : <p children="Not connected..." />}
                        </TableCell>
                        </TableRow>
                        {/* <TableRow>
                            <TableCell><b>Status</b></TableCell>
                            <TableCell>
                                {colabState}
                            </TableCell>
                        </TableRow> */}
                    </TableBody>
                </Table>
            </Box>;
}


function ColabConnectButton() {
    return <Button color="secondary" href={colabURL} target="_blank">[ Launch ]</Button>
}
