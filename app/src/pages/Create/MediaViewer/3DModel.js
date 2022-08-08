import {OBJModel} from 'react-3d-viewer';

export default function ObjViewer({ content, style, filename }) {
    return <OBJModel src={content} style={{...style, height: null, }} background="rgba(0,0,0,0)" />
  }

