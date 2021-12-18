import Markdown from "markdown-to-jsx"
import useContent from '../../hooks/useContent'

const InstructionsView = () => {

let content = useContent('instructions')

return <Markdown>{content}</Markdown>

}

export default InstructionsView