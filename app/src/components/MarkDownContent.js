import Typography from "@material-ui/core/Typography"
import Markdown from "markdown-to-jsx"
import { range, zipObj } from "ramda"
import useFetchText from "../hooks/useFetchText"
import useMarkdown from "../hooks/useMarkdown"

// replacements allow replacing dynamic content in the markdown
// the syntax is {[key]} which will be matched with the props passed to this object

const MarkDownContent = ({ url, ...replacements }) => {
  const raw = useFetchText(url)
  const { body } = useMarkdown(raw)
  const headersToInclude = range(1, 7)

  // header tags
  const tags = headersToInclude.map((i) => `h${i}`)

  // elements to override the header tags with
  const overrideElements = tags.map((tag) => ({ children }) => (
    <Typography variant={tag} children={children} />
  ))

  const overrides = zipObj(tags, overrideElements)

  const contentWithReplacements = applyReplacements(replacements, body)

  return <Markdown options={{ overrides }} >{contentWithReplacements}</Markdown>
}

export default MarkDownContent

// transform all {[key]} strings to the replacements coming from the props
const applyReplacements = (replacements, content) =>
  Object.entries(replacements).reduce(replaceOne, content)

const replaceOne = (content, [key, replacement]) => content.replaceAll(`{${key}}`, replacement)
