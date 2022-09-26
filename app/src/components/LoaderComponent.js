import styled from "@emotion/styled";
import Box from "@material-ui/core/Box";
import LinearProgress from "@material-ui/core/LinearProgress";
import Typography from "@material-ui/core/Typography";
import { Colors } from "../styles/global";



const LoaderComponent = ({ info_text, progress }) => {
    return <Style>
        <Box display="flex" alignItems="center" m={1}>
        <Box width="100%" mr={1}>
            {info_text}
            <LinearProgress value={progress} variant="determinate" color="secondary" /> 
        </Box> 
        <Box minWidth={35}>
            <Typography variant="body2" color="textSecondary">
            <b> {`${Math.floor(progress)}%`} </b>
            </Typography>    
        </Box>   
        </Box> 
    </Style>
}

const Style = styled.div`
.MuiLinearProgress-colorSecondary {
  background-color: grey !important;
}
.MuiLinearProgress-barColorSecondary {
  background-color: ${Colors.accent} !important;
}
`
export default LoaderComponent