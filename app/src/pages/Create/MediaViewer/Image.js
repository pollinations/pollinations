
const ImageDisplay = ({filename, content, style}) => 
    <img 
        alt={filename} 
        src={content} 
        width="100%" 
        height="auto" 
        style={style}
    />

export default ImageDisplay;