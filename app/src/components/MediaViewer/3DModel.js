import {OBJModel} from 'react-3d-viewer';

export default function ObjViewer({ content, style, filename }) {
    return <OBJModel 
      src={content} 
      style={{...style, height: null, }} 
      background="rgba(0,0,0,0)" 
      scale= {{x:0.2, y:0.2, z: 0.2}} />
  }

