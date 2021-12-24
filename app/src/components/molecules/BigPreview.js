
const BigPreview = ({ filename, url }) => {

    const isVideo = filename && (filename.endsWith(".mp4") || filename.endsWith(".webm") || filename.endsWith(".ogv") || filename.endsWith(".mov") || filename.endsWith(".avi"))
    if (!url) return <div style={{minHeight:'80vh'}}/>
  
    if (!isVideo) return <img alt={filename} src={url} style={{height: '80vh'}} />
    
    return <video muted autoPlay controls loop alt={filename} src={url}
    style={{ width: 'calc(100vh - 90px)', maxWidth: '100%' }}/>
}

export default BigPreview