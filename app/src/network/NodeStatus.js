import React from "react";
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import { displayContentID } from "./utils";
import { getWebURL } from "./ipfsConnector";

export default ({ nodeID, contentID }) => (
    <TableContainer>
        <Table size="small" >
            <TableBody>
                <TableRow>
                    <TableCell>
                        NodeID
            </TableCell>
                    <TableCell>
                        <b>{nodeID ? displayContentID(nodeID) : "Not connected..."}</b>
                    </TableCell>
                </TableRow>
                <TableRow>
                    <TableCell>
                        ContentID </TableCell>
                    <TableCell>
                        <b>{contentID ? <a href={getWebURL(contentID)} >{displayContentID(contentID)}</a>: "Not connected..."}</b>
                    </TableCell>
                </TableRow>
            </TableBody>
        </Table>
    </TableContainer>
)
