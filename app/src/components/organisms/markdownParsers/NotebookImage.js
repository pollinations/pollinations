import { compiler } from "markdown-to-jsx"

const NotebookImage = ({ metadata, style }) => {
  if (!metadata) return <></>
  return <img src={NotebookImgUrl(metadata)}
    style={{ width: style.width, padding: style.padding ? style.padding : 0 }} />
}

export const NotebookImgUrl = (metadata) => {

  if (!metadata) return null
  
  let test = compiler(metadata.description, { wrapper: null })
  return test[0]?.props?.src ? test[0]?.props?.src : test[0]?.props?.children[0]?.props?.src
}

  export default NotebookImage