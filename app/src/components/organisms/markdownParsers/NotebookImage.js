import { compiler } from "markdown-to-jsx"

const NotebookImage = ({ metadata, style }) => {
    if (!metadata) return <></>
  
    let test = compiler(metadata.description, { wrapper: null })
  
    return <img src={
      test[0]?.props?.src ?
        test[0]?.props?.src
        : test[0]?.props?.children[0]?.props?.src}
      style={{ width: style.width, padding: style.padding ? style.padding : 0 }} />
  }

  export default NotebookImage