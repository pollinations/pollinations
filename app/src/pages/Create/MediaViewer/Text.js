import { Box, Paper } from "@material-ui/core";
import Markdown from 'markdown-to-jsx';


const MarkdownViewer = ({content, filename, style}) =>
<Paper variant="outlined" style={style}>
    <Box m={2}>
        <Markdown key={filename}>
            {content}
        </Markdown>
    </Box>
</Paper>

export default MarkdownViewer;