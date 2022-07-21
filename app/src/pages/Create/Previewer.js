import { getMedia } from "../../data/media";
import styled from '@emotion/styled';
import MediaViewer from "./MediaViewer/";

const Previewer = ({ ipfs }) => {

    const images = getMedia(ipfs.output);

    if (!images.length) return null;

    return <Style>
      {
        images.map(([filename, url, type]) => <>
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
width: 100%;

display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
grid-gap: 0.5em;
img {
  width: 100%;
}
`