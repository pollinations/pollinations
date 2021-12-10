const BigPreview = ({ isVideo, filename, url }) => {

    if (!url) return <div style={{minHeight:'80vh'}}/>
  
    if (!isVideo) return <img alt={filename} src={url} style={{height: '80vh'}} />
    
    return <video muted autoPlay controls loop alt={filename} src={url}
    style={{ width: 'calc(100vh - 90px)' }}/>
}

export default BigPreview