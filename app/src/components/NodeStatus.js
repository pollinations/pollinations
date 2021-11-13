import React from "react";
import { displayContentID } from "../network/utils";
import { getIPNSURL, getWebURL } from "../network/ipfsConnector";
import { Button, Link, ListItem as MuiListItem, Table, TableRow, TableBody, TableCell as MuiTableCell, withStyles, styled, List, Typography, Box} from "@material-ui/core"
import WarningIcon from '@material-ui/icons/Error';
import Debug from "debug";

const debug = Debug("NodeStatus");

const colabURL = "https://colab.research.google.com/github/pollinations/pollinations/blob/social-post-dockerized/colabs/pollinator.ipynb";

// Display the connection status to colab and currect IPFS content ID
export default ({ nodeID, contentID,  gpu, heartbeat }) => {
    
    gpu = parseGPU(gpu);
    debug("parsed GPU", gpu);

    const gpuInfo = gpu && `${gpu} ${gpuSmilie[gpu]}`;
    
    const disconnected = !heartbeat || !heartbeat.alive;
    const nodeInfo = !nodeID || disconnected ? <ColabConnectButton disconnected={disconnected} />  : gpuInfo || displayContentID(nodeID);

    return <Box style={{width:"220px", marginLeft:"auto"}}>
        <Table size="small" aria-label="a dense table" >
                    <TableBody>
                        <TableRow>
                            <TableCell><b>GPU</b></TableCell>
                            <TableCell>{ nodeInfo}</TableCell>
                        </TableRow>
                        <TableRow>
                        <TableCell ><b>ContentID</b></TableCell>
                            <TableCell>{contentID ?
                                <Link
                                    href={getWebURL(contentID)} 
                                    children={displayContentID(contentID)}
                                    target="_blank"
                                />
                                : <p children="N/A" />}
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


const gpuSmilie = {
    "Tesla T4" : "😐",
    "Tesla K80" : "😴",
    "Tesla P100" : "😀",
    "Tesla V100" : "😍",
}

// extract GPU name from ipfs
// the GPU was written to ipfs by running `nvidia-smi` on colab
const parseGPU = gpu  => 
    gpu?.replace(/\(.*\)/g, "")?.replace("GPU 0:", "")?.split("-")[0]?.trim();


const ColabConnectButton = disconnected => <Button color="secondary" href={colabURL} target="colab">[ {disconnected ? <><WarningIcon />Launch</> : "Launch"} ]</Button>;


const TableCell = withStyles({
    root: {
      borderBottom: "none",
      padding: "2px"
    }
  })(MuiTableCell);

