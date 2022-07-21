import MarkdownViewer from "./Text";
import AudioViewer from "./Audio";
import ImageDisplay from "./Image";
import VideoDisplay from './Video';

const TypeMaps = {
  "image": ImageDisplay,
  "video": VideoDisplay,
  "audio": AudioViewer,
  "text": MarkdownViewer
}
const MediaViewer =  ({ filename, content, type, style }) => {
    const Viewer = TypeMaps[type]
    if (!Viewer) return null;

    return <Viewer filename={filename} content={content} style={style} />
}

export default MediaViewer