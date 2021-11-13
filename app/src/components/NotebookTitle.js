import { Typography } from "@material-ui/core";


const NotebookTitle = ({metadata, children}) => (metadata &&
    <Typography 
        variant="h5" 
        component="h5" 
        gutterBottom>
        { 
            metadata.name 
        }
        &nbsp;
        {children && {...children}}
    </Typography>
);

export default NotebookTitle;