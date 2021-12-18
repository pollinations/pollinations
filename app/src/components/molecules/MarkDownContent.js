import Typography from "@material-ui/core/Typography"
import Markdown from "markdown-to-jsx"
import useContent from "../../hooks/useContent"

const MarkDownContent = ({ id }) => {

    let content = useContent(id)

    return <Markdown options={{
        overrides: {
            h1: { component: H1 },
            h2: { component: H2 },
            h3: { component: H3 },
            h4: { component: H4 },
            h5: { component: H5 },
            h6: { component: H6 },
        }
    }}>
        {content}
    </Markdown>
}

// surprise
const H1 = ({ children }) => <Typography variant='h1' children={children} />
const H2 = ({ children }) => <Typography variant='h2' children={children} />
const H3 = ({ children }) => <Typography variant='h3' children={children} />
const H4 = ({ children }) => <Typography variant='h4' children={children} />
const H5 = ({ children }) => <Typography variant='h5' children={children} />
const H6 = ({ children }) => <Typography variant='h6' children={children} />



export default MarkDownContent