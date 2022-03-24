import { Button, IconButton } from "@material-ui/core"
import ArrowUpward from '@material-ui/icons/ArrowUpward'
import { useRef, useState } from "react"
import useClickOutside from "../../hooks/UI/useClickOutside"
import LaunchColabButton from "../molecules/LaunchColabButton"


const ToolBarHeader = ({ node, setOpen, open, showNode }) => {

    function go2Pollen() {
        setOpen(false)
        showNode()
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
                <Button onClick={go2Pollen} children='[ Current Pollen ]' />
            }
            <IconButton onClick={() => setOpen(state => !state)}>
                <ArrowUpward fontSize='small' style={{ transform: `rotateZ(${open ? '180deg' : '0deg'})` }} />
            </IconButton>
        </div>

    </div>
}

const ToolBarContent = ({ children }) => {
    return <div style={{
        width: '500px',
        padding: '1em',
        overflow: 'auto'
    }} children={children} />
}


const ToolBar = ({ children, node, showNode }) => {

    const [open, setOpen] = useState(false)
    const toolbarRef = useRef()

    useClickOutside(toolbarRef, () => setOpen(false))


    return <div ref={toolbarRef} style={{
        position: 'fixed',
        bottom: 0,
        right: 30,
        minWidth: '30%',
        maxWidth: '470px',
        minHeight: 50,
        maxHeight: 500,
        height: open ? 500 : 50,
        transition: 'height 0.08s ease-in',
        borderRadius: '10px 10px 0 0',
        backgroundColor: '#222',
        padding: '0.3em',
        overflowY: open ? 'auto' : 'hidden'
    }} >
        <ToolBarHeader open={open} setOpen={setOpen} node={node} showNode={showNode} />
        <ToolBarContent>
            {children}
        </ToolBarContent>

    </div>
}

export default ToolBar