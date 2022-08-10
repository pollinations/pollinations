
const VideoDisplay = ({filename, content, style}) => 
    <video 
        alt={filename} 
        controls 
        src={content} 
        width="100%" 
        height="auto" 
        preload="metadata" 
        style={style}
    />

export default VideoDisplay;