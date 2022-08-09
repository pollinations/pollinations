import MarkdownViewer from "./Text";
import AudioViewer from "./Audio";
import ImageDisplay from "./Image";
import VideoDisplay from './Video';
import ModelViewer from './3DModel';

const TypeMaps = {
  "image": ImageDisplay,
  "video": VideoDisplay,
  "audio": AudioViewer,
  "text": MarkdownViewer,
  "3dmodel": ModelViewer
}
const MediaViewer =  ({ filename, content, type, style }) => {
    const Viewer = TypeMaps[type]
    if (!Viewer) return null;

    return <Viewer filename={filename} content={content} style={style} />
}

export default MediaViewer