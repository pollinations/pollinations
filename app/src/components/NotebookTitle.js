import { Typography } from "@material-ui/core";


const NotebookTitle = ({name, children, style}) => (name && (
    <Typography 
        variant="h5" 
        component="h5" 
        gutterBottom style={style}>
        { 
            name 
        }
        &nbsp;
        {children && {...children}}
    </Typography>) || null
);

export default NotebookTitle;