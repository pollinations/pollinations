import { displayContentID } from "../network/utils";
import { getWebURL } from "../network/ipfsConnector";
import Acordion from './Acordion'

// Styles temporary
let RowStyle = {
    display: 'flex', 
    flexDirection: 'column',
    flexWrap: 'wrap',
    borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
    alignItems: 'flex-start',
    marginRight: 20,
    paddingBottom: 5,
    marginBottom: 5
    };
let LinkStyle = {
    wordBreak: 'break-all',
    color: 'whitesmoke',
    margin: '0 0 20px',
}

export default ({ nodeID, contentID }) => {
    return <>

    <div style={RowStyle}>
        <p children='NodeID'/>
        
        <Acordion 
            visibleContent={nodeID ? displayContentID(nodeID) : "Not connected..."}
            hiddenContent={'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'} />
    </div>
    

    <div style={RowStyle}>
        <p children='ContentID'/>

        {contentID ? 
        <a style={LinkStyle}
            href={getWebURL(contentID)} children={displayContentID(contentID)}/>
        : <p children="Not connected..."/>}
    </div>
    </>
}
