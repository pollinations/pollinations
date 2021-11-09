import { Box, Typography, Container, Link, TextField, IconButton } from "@material-ui/core"
import GpuInfo from "./molecules/GpuInfo"
import LaunchColabButton from "./molecules/LaunchColabButton"
import { displayContentID } from "../network/utils"
import { useState } from "react"
import ArrowUpward from '@material-ui/icons/ArrowUpward'

let BoxProps = {
    width: '96%',
    minHeight: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: 'auto',
    
}

let ToolBarHeader = ({ node, setOpen, open}) => {

    return <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
    }} >
        <LaunchColabButton {...node} />
        <div>
        <IconButton onClick={() => setOpen(state => !state)}>
            <ArrowUpward fontSize='small' style={{ transform: `rotateZ(${open ? '180deg' : '0deg'})`}} />
        </IconButton>
        </div>

    </div>
}
let ToolBarContent = ({ children }) => {

    return <div style={{
        padding: '1em'
    }} children={children}/>
}


let DrawerStyle = ({ children, node }) => {

    const [open, setOpen] = useState(false)

    return <div style={{
        position: 'fixed',
        bottom: 0,
        right: 30,
        minWidth: '30%',
        maxWidth: '500px',
        height: open ? 500 : 50,
        transition: 'height 0.1s ease-in',
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

let ContentId = ({ contentID, connected }) => {
    if (!connected) return <></>
    if (!contentID) return <Typography> ContentId: N/A </Typography>
    return <Typography > ContentId: <Link to="/n" children={displayContentID(contentID)}/> </Typography>
}

const Footer = ({ ...node }) => {

    return <DrawerStyle node={node}>
        <GpuInfo {...node} />
        <ContentId {...node} />
    </DrawerStyle>
}

export default Footer