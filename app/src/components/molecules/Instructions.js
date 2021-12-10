import Markdown from "markdown-to-jsx"

const instructions =
    `1. Click on [ LAUNCH GPU ]. A new browser tab will launch.
2. In the new tab, click Runtime --> Run All
3. On the pop-up warning, click "run anyway."
4. Return to this browser tab.


Note 1: *This is run using Google Colab's spare computing resources, and will not run quickly or sometimes you need to retry a few times when no GPUs are available.*

Note 2: *There are some bugs in the code of Pollinations which result in it becoming desyncronized with Colab. Sometimes one has to go to the Colab tab and click "Runtime -> Restart and Run All" and continue from step 5.*

Note 3: *A bot is optionally posting finished Pollinations to Twitter and a few other social networks. Data is stored on the Interplanetary Filesystem. No information about the user is saved. Use the checkbox to deactivate posting.*
`

const InstructionsView = () => <Markdown>{instructions}</Markdown>

export default InstructionsView