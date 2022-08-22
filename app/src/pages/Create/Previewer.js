import { getMedia, mediaToDisplay } from "../../data/media";
import styled from '@emotion/styled';
import MediaViewer from "../../components/MediaViewer/";
import { useMemo } from "react";

const Previewer = ({ ipfs }) => {
    if (!ipfs) return null;

    // only show first 4 media
    const medias = getMedia(ipfs.output).slice(0,4);
    const first = medias[0];

    if (!medias.length) return null;

    return <Style>
      <MediaViewer filename={first[0]} content={first[1]} type={first[2]} />
      <StepGallery children={
        medias
        .slice(1)
        .map(([filename, url, type]) => <>
          <MediaViewer 
            key={filename}
            content={url} 
            filename={filename} 
            type={type}
          />
          </>
        )
      }/>
    </Style>
}   

export default Previewer

const Style = styled.div`
width: 100%;
display: flex;
flex-direction: column;
align-items: center;
img{
  width: auto;
  max-width: 100%;
  max-height: 75vh;
  margin: 0 auto;
}
`
const StepGallery = styled.div`
width: 100%;
margin-top: 2em;

display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
grid-gap: 0.5em;
`