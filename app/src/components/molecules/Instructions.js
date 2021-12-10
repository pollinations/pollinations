// T

import { Box, List, ListItem, Typography } from "@material-ui/core"
import Markdown from "markdown-to-jsx"
import useIPFS from "../../hooks/useIPFS"
import { getNotebookMetadata } from "../../utils/notebookMetadata"
import BigPreview from "./BigPreview"

const instructions = 
`
// 1. Click on [ LAUNCH GPU ]. A new browser tab will launch.
// 2. In the new tab, click Runtime --> Run All
// 3. On the pop-up warning, click "run anyway."
// 4. Return to this browser tab.


Note 1: This is run using Google Colab's spare computing resources, and will not run quickly or sometimes you need to retry a few times when no GPUs are available.

Note 2: There are some bugs in the code of Pollinations which result in it becoming desynchronized with Colab. Sometimes one has to go to the Colab tab and click "Runtime -> Restart and Run All" and retry.

Note 3: Data is stored on the Interplanetary Filesystem. No information about the user is saved.
`

const InstructionsView = () => {

const { input } = useIPFS('QmRm85XGkXwyq8oAo69K4K47YpMxV2yPGHnvKWER18x1hE')

return <Box display='flex' justifyContent='space-between' flexDirection='column'>
    <Box maxWidth='100%'>
    <BigPreview isVideo filename='' url={input ? input['video_file.mp4'] : ''}/>
    </Box>
    <List>
        <ListItem>
            Note 1: This is run using Google Colab's spare computing resources, 
            and will not run quickly or sometimes you need to retry a few times when no GPUs are available.
        </ListItem>

        <ListItem>
            Note 2: There are some bugs in the code of Pollinations which result in it becoming desynchronized with Colab. 
            Sometimes one has to go to the Colab tab and click "Runtime -> Restart and Run All" and retry.
        </ListItem>

        <ListItem>
            Note 3: Data is stored on the Interplanetary Filesystem. No information about the user is saved.
        </ListItem>
    </List>
</Box>
}
export default InstructionsView