import { displayContentID } from "../network/utils";
import { getWebURL } from "../network/ipfsConnector";
import Acordion from './Acordion'
import { Button, Link, Typography } from "@material-ui/core"

const colabURL = "https://colab.research.google.com/github/voodoohop/pollinations/blob/dev/colabs/pollinator.ipynb";

// Styles temporary
let WrapperStyle = {
    display: 'flex',
    flexWrap: 'wrap'
}
let RowStyle = {
    width: 'calc(50% - 5px)',
    display: 'flex', 
    flexDirection: 'column',
    justifyContent: 'flex-start',
    borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
    alignItems: 'flex-start',
    padding: '10px 5px 10px 0 !important',
    padding: 2.5
    };
let LinkStyle = {
    wordBreak: 'break-all',
    color: 'whitesmoke',
    padding: '10px 0'
}
let ParagraphStyle = {
    margin: '5px 0',
    fontWeight: 'bold',
    opacity: 0.9
}

export default ({ nodeID, contentID, status, ipfs }) => {
    const colabState = ipfs?.status?.colabState;
    return <>
            <h3>Status <Typography component="span">[{status}, {colabState}]</Typography></h3>
            <div style={WrapperStyle}>
            <div style={RowStyle}>
                <p children='NodeID' style={ParagraphStyle}/>
                {nodeID ? <Link style={LinkStyle}>{displayContentID(nodeID)}</Link> : <ColabConnectButton />}
                   

                
            </div>

            <div style={RowStyle}>
                <p children='ContentID' style={ParagraphStyle}/>
                {contentID ? 
                <Link style={LinkStyle}
                    href={getWebURL(contentID)} children={displayContentID(contentID)}
                    target="_blank"
                    />
                : <p children="Not connected..."/>}
            </div>

            </div>
    </>
}


function ColabConnectButton() {
    return <Button color="secondary" href={colabURL} target="_blank">Launch Colab Node</Button>
}
