import { Box, Typography, Container, Link, TextField } from "@material-ui/core"
import GpuInfo from "./molecules/GpuInfo"
import LaunchColabButton from "./molecules/LaunchColabButton"
import { displayContentID } from "../network/utils"

let BoxProps = {
    width: '96%',
    minHeight: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: 'auto',
    
}


let ContentId = ({ contentID, connected }) => {
    if (!connected) return <></>
    if (!contentID) return <p> N/A </p>
    return <Link to="/n">{displayContentID(contentID)}</Link>
}

const Footer = ({ ...node }) => <footer className='MuiPaper-root MuiPaper-elevation4'>
    <Box {...BoxProps} >  
        <GpuInfo {...node} />
        <LaunchColabButton {...node} />
        <ContentId {...node} />
    </Box>
</footer>


export default Footer