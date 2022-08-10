
const AudioViewer = ({ content, style, filename }) =>
<>
    <audio 
        controls 
        src={content} 
        style={{...style, height: null}}
    />
    {filename}
</>

export default AudioViewer;
