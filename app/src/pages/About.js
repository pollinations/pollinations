import Markdown from "markdown-to-jsx"
import useContent from "../hooks/useContent"

const About = () => {

    let content = useContent('about')

    return <Markdown>
        {content}
    </Markdown>
}

export default About