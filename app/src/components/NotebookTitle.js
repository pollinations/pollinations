import { Typography } from "@material-ui/core";


const NotebookTitle = ({metadata}) => (metadata &&
    <Typography 
        variant="h5" 
        component="h5" 
        gutterBottom>
        { 
        metadata.name 
        }
    </Typography>
);

export default NotebookTitle;