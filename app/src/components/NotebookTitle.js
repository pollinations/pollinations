import { Typography } from "@material-ui/core";


const NotebookTitle = ({name, children}) => (name && (
    <Typography 
        variant="h5" 
        component="h5" 
        gutterBottom>
        { 
            name 
        }
        &nbsp;
        {children && {...children}}
    </Typography>) || null
);

export default NotebookTitle;