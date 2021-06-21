import React from 'react'
import { CardContent, Typography } from "@material-ui/core"
import ReactJson from 'react-json-view'
import { displayContentID } from "../network/utils";

export const IpfsLog = ({state}) => {
    const {ipfs, contentID} = state;
    return <div style={{maxWidth: '100%', overflow: 'hidden'}}>

        <CardContent>
            <Typography
                variant="body2"
                color="textPrimary"
                component="pre"
                children={
                    ipfs.status && ipfs.status.log ? formatLog(ipfs.status.log) : "Loading..."
                } />
        </CardContent>

        <CardContent>
            <ReactJson
                src={ipfs}
                name={displayContentID(contentID)}
                enableClipboard={false}
                displayDataTypes={false}
                displayObjectSize={false}
                collapsed={true} />
        </CardContent>

    </div>

}
const formatLog = 
        log =>  log
                .replace(/\].*/g, "")
                .split("\n")
                .slice(-10)
                .join("\n");


