import React from 'react'
import { CardContent, Typography } from "@material-ui/core"
import useColab from "../network/useColab"
import ReactJson from 'react-json-view'
import { displayContentID, noop } from "../network/utils";

export const IpfsLog = () => {

    const { state } = useColab(); // {state:{ipfs:{},contentID: null, nodeID:null}, dispatch: noop}
    const { ipfs } = state;

    return <div style={{maxWidth: '100%', overflow: 'hidden'}}>

        <CardContent>
            <Typography
                variant="body2"
                color="textPrimary"
                component="pre"
                style={{ fontWeight: "bold" }}
                children={
                    ipfs.output && ipfs.output.log ? formatLog(ipfs) : "Loading..."
                } />
        </CardContent>

        <CardContent>
            <ReactJson
                src={state.ipfs}
                name={displayContentID(state.contentID)}
                enableClipboard={false}
                displayDataTypes={false}
                displayObjectSize={false}
                collapsed={true} />
        </CardContent>

    </div>

}
function formatLog(ipfs) {
    return ipfs.output.log
            .replace(/\].*/g, "")
            .split("\n")
            .slice(-4)
            .join("\n");
}

