import { getMedia } from "../../data/media";
import styled from '@emotion/styled';
import MediaViewer from "./MediaViewer/";

const Previewer = ({ ipfs }) => {
    if (!ipfs) return null;

    const medias = getMedia(ipfs.output);

    if (!medias.length) return null;

    return <Style>
      {
        medias.map(([filename, url, type]) => <>
          <MediaViewer 
            key={filename}
            content={url} 
            filename={filename} 
            type={type}
          />
          </>
        )
      }
    </Style>
}   

export default Previewer

const Style = styled.div`
width: 90%;
margin: auto;
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
grid-gap: 0.5em;
img {
  width: 100%;
}
`