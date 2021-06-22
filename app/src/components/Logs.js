import React from 'react'
import { Button, CardContent, Link, Typography } from "@material-ui/core"
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
    const log = ipfs.output && ipfs.output.log;
    return <div style={{maxWidth: '100%', overflow: 'hidden'}}>
         <h3>Logs [<Button style={LinkStyle}
                href={getWebURL(`${contentID}/output/log`)} 
                target="_blank"
            >
                See Full
            </Button>]</h3>
        {log && <CardContent>
            <Typography
                variant="body2"
                color="textPrimary"
                component="pre">
                {
                    log ? formatLog(log) : "Loading..."
                }
            </Typography>
        </CardContent>}

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


