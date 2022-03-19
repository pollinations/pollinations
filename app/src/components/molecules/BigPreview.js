import { MediaViewer } from "../MediaViewer"

const BigPreview = ({ filename, url, type }) => {

  
    if (!url) return <div style={{minHeight:'80vh'}}>Processing...</div>

    return <MediaViewer filename={filename} content={url} type={type} style={{ width: 'calc(100vh - 90px)', maxWidth: '100%' }} />
}

export default BigPreview