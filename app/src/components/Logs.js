import React from 'react'
import { CardContent, Link, Typography } from "@material-ui/core"
import ReactJson from 'react-json-view'
import { displayContentID } from "../network/utils";
import { getWebURL } from '../network/ipfsConnector';

const LinkStyle = {
    wordBreak: 'break-all',
    color: 'whitesmoke',
    padding: '10px 0'
}

export const IpfsLog = ({state}) => {
    const {ipfs, contentID} = state;
    
    return <div style={{maxWidth: '100%', overflow: 'hidden'}}>

        <CardContent>
            <Typography
                variant="body2"
                color="textPrimary"
                component="pre">
                {
                    ipfs.status && ipfs.status.log ? formatLog(ipfs.status.log) : "Loading..."
                }
            </Typography>
            <Link style={LinkStyle}
                href={getWebURL(`${contentID}/status/log`)} 
                target="_blank"
            >
                See Full
            </Link>
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


