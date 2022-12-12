import { MediaViewer } from "../MediaViewer"

const BigPreview = ({ filename, url, type }) => {
    return <MediaViewer filename={filename} content={url} type={type} style={{ width: 'calc(100vh - 90px)', maxWidth: '100%'}} />
}

export default BigPreview

