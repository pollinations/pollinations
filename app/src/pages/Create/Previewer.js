import styled from '@emotion/styled';
import MediaViewer from "../../components/MediaViewer/";
import { getMedia } from "../../data/media";

const Previewer = ({ ipfs }) => {
    if (!ipfs) return null;

    // only show first 4 media
    const medias = getMedia(ipfs.output);//.slice(0,4);
    const first = medias[0];

    if (!medias.length) return null;

    return <Style>
      <OutputStage>
        <MediaViewer 
          style={{ maxWidth: "100%", height: "100%" }}
          filename={first[0]} 
          content={first[1]} 
          type={first[2]} />
      </OutputStage>
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

const OutputStage = styled.div`
width: 100%;
height: 50vh;
padding: 1em;
display: flex;
justify-content: center;
align-items: center;
// background: #000;
`

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
grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
grid-gap: 0.5em;
`