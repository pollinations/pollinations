import React from 'react'
import { Button, CardContent, Link, Typography } from "@material-ui/core"
// import ReactJson from 'react-json-view'
import Ansi from "ansi-to-react";

import { getWebURL }  from  "@pollinations/ipfs/ipfsConnector";
// import JupyterViewer from "react-jupyter-notebook";

export const IpfsLog = ({ipfs,contentID}) => {

    const log = ipfs.output && ipfs.output.log;
    if (!log)
        return null;
    return <div style={{maxWidth: '100%', overflow: 'hidden'}}>
         <h3>Logs [<Button 
                href={getWebURL(`${contentID}/output/log`)} 
                target="_blank"
            >
                See Full
            </Button>]</h3>
        {log && <CardContent>
            <Typography
                variant="body2"
                color="textSecondary"
                component="pre">
                    <Ansi>
                {
                     log ? formatLog(log) : "Loading..."
                        // <JupyterViewer
                        //     rawIpynb={ipfs?.output?.["notebook_output.ipynb"]}
                        //     mediaAlign="center"
                        //     displaySource="hide"
                        //     displayOutput="auto"
                        //     />
                }
                </Ansi>
            </Typography>
        </CardContent>}

    </div>

}
const formatLog = 
        log =>  log?.replace && log
                .replace(/\].*/g, "")
                .split("\n")
                .filter(s => !s.startsWith("unhandled iopub") && !s.startsWith("Writing failed") && !s.includes("[0m") && !(s.trim().length === 0))
                .slice(-10)
                .join("\n");


