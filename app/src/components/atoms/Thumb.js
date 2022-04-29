import styled from '@emotion/styled';
import mime from 'mime-types';

const ThumbContainer = styled.div`
display: inline-flex;
border-radius: 2px;
width: 90%;

box-sizing: border-box;
div {
  display: flex;
  min-width: 0;
  overflow: hidden;

  img, video {
      display: block;
      width: auto;
      min-height: 100%;
      max-width: 100%;
  }
}`
const Container = styled.aside`
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
`

const Thumbs = ({ files }) => <Container>
    {
        files.map(Thumb)
    }
</Container>;


const Thumb = ({path, preview}) => {
    const mimeType = mime.lookup(path);
    const type = mimeType.split('/')[0];
    
    return <ThumbContainer key={name}>
        <div>
            {
                (type === 'video' && <video src={preview} autoPlay controls/>)
                ||
                (type === 'image' && <img src={preview} />)
                ||
                (type === 'audio' && <p children={name} />)
            }
        </div>
    </ThumbContainer>
}

export default Thumbs