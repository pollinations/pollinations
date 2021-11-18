import LaunchColabButton from "../molecules/LaunchColabButton"
import { useState } from "react"
import ArrowUpward from '@material-ui/icons/ArrowUpward'
import { Button, IconButton } from "@material-ui/core"



let ToolBarHeader = ({ node, setOpen, open, showNode }) => {

    function go2Pollen(){
        setOpen(false)
       showNode(node.nodeID)
    }

    return <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
    }} >
        <LaunchColabButton {...node} />
        
        <div>
        {
            (node.connected && node.contentID) &&
            <Button onClick={go2Pollen} children='[ Current Pollen ]'/>
        }
        <IconButton onClick={() => setOpen(state => !state)}>
            <ArrowUpward fontSize='small' style={{ transform: `rotateZ(${open ? '180deg' : '0deg'})`}} />
        </IconButton>
        </div>

    </div>
}

let ToolBarContent = ({ children }) => {
    return <div style={{
        width: '500px',
        padding: '1em',
        overflow: 'auto'
    }} children={children}/>
}


let ToolBar = ({ children, node }) => {

    const [open, setOpen] = useState(false)

    return <div style={{
        position: 'fixed',
        bottom: 0,
        right: 30,
        minWidth: '30%',
        maxWidth: '90%',
        minHeight: 50,
        maxHeight: 500,
        height: open ? 500 : 50,
        transition: 'height 0.08s ease-in',
        borderRadius: '10px 10px 0 0',
        backgroundColor: '#222',
        padding: '0.3em'
    }} >
        <ToolBarHeader open={open} setOpen={setOpen} node={node}/>
        <ToolBarContent>
            {children}
        </ToolBarContent>
        
    </div>
}

export default ToolBar