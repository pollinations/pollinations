import Typography from "@material-ui/core/Typography"
import Markdown from "markdown-to-jsx"
import useContent from "../../hooks/useContent"

const MarkDownContent = ({ id }) => {

    let content = useContent(id)

    const headersToInclude = range(1, 7)

    // header tags
    const tags = headersToInclude.map(i => `h${i}`)

    // elements to override the header tags with
    const overrideElements = tags.map(tag =>
        ({ children }) => <Typography variant={tag} children={children} />
    )

    const overrides = zipObj(tags, overrideElements)

    return <Markdown options={{ overrides }}>
        {content}
    </Markdown>
}


export default MarkDownContent