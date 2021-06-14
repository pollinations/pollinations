import { displayContentID } from "../network/utils";
import { getWebURL } from "../network/ipfsConnector";
import Acordion from './Acordion'

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

export default ({ nodeID, contentID }) => {
    return <div style={WrapperStyle}>

    <div style={RowStyle}>
        <p children='NodeID' style={ParagraphStyle}/>
        
        <Acordion 
            visibleContent={nodeID ? displayContentID(nodeID) : "Not connected..."}
            hiddenContent={'Lorem ipsum dolor sit amet, consectetur adipiscing elit.123123123'} />
    </div>
    

    <div style={RowStyle}>
        <p children='ContentID' style={ParagraphStyle}/>
        {contentID ? 
        <a style={LinkStyle}
            href={getWebURL(contentID)} children={displayContentID(contentID)}/>
        : <p children="Not connected..."/>}
    </div>
    </div>
}
