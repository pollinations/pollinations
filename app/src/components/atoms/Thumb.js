import styled from '@emotion/styled';
import Debug from 'debug';
import mime from 'mime-types';

const debug = Debug("Thumb")

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


const Thumb = ({name, url}) => {
    
    const mimeType = mime.lookup(name);
    const type = mimeType.split('/')[0];
    
    debug("type", type, "name", name, "url", url)

    return <ThumbContainer key={name}>
        <div>
            {
                (type === 'video' && <video src={url} autoPlay controls/>)
                ||
                (type === 'image' && <img src={url} />)
                ||
                (type === 'audio' && <p children={name} />)
            }
        </div>
    </ThumbContainer>
}

export default Thumbs