import {OBJModel} from 'react-3d-viewer';
import Debug from "debug";

const debug = Debug("3DModelViewer");
export default function ObjViewer({ content, style, filename }) {
  debug("ObjViewer", content)

  if (filename.toLowerCase().endsWith(".glb")) 
    return <model-viewer 
      src={content} 
      style={{...style, width: "70vh", height: "70vh"}} 
      camera-controls />
  else
    return <OBJModel 
      src={content} 
      style={{...style, height: null, }} 
      background="rgba(0,0,0,0)" 
      scale= {{x:0.2, y:0.2, z: 0.2}} />
}

