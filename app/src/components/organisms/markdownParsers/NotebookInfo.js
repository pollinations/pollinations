import Markdown from "markdown-to-jsx"


const NotebookInfo = ({ description, noImg }) => {

    if (noImg) return <Markdown options={MarkDownOptions}>
        {description}
    </Markdown>

    return <Markdown children={description}/>
}

// surprise, it's a div instead!
const gambiarraImg = ({ children, ...props }) => (
    <div />
  )
  const MarkDownOptions = {
    overrides: {
      img: { component: gambiarraImg }
    }
}

export default NotebookInfo