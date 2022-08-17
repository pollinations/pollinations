import {OBJModel} from 'react-3d-viewer';
import Debug from "debug";
import { Link } from 'react-router-dom';


const debug = Debug("3DModelViewer");

export default function ObjViewer({ content, style, filename }) {
  debug("ObjViewer", content)

  content = content?.replaceAll(".bin", ".obj");
  content = content?.replaceAll("https://ipfs.pollinations.ai", "");
  
  if (filename.toLowerCase().endsWith(".glb")) 
    return <div>
      <div>
        <model-viewer 
                src={content} 
                style={{...style, width: "70vh", height: "70vh"}} 
                camera-controls />
        </div>
        <div>
          
          <a href={content} download target="_blank">Download</a>
          
        </div>
      </div>
  else
    return <div><OBJModel 
      src={content} 
      style={style} 
      width={'328'}
      height={'328'}
      background="rgba(0,0,0,0)" 
      scale= {{x:0.2, y:0.2, z: 0.2}} />
      <a href={content} download target="_blank">Download</a>
      </div>
}

