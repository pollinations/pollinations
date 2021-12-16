import Markdown from "markdown-to-jsx"
import useContent from "../hooks/useContent"

const Help = () => {

    let content = useContent('help')

    return <Markdown>
        {content}
    </Markdown>
}

export default Help