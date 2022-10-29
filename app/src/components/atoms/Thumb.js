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
    justify-content: center;
    align-items: center;
    flex-direction: row;
    flex-wrap: wrap;
`

const Thumbs = ({ files }) => <Container>
    {
        files.map(Thumb)
    }
</Container>;


export const Thumb = (url, i) => {
    
    // debug("thumb url", url)

    let mimeType = null;
    if (isDataURL(url)) {
        mimeType = url.split(";")[0].split(":")[1];
    } else {
        mimeType = mime.lookup(name);
    }
    const type = mimeType.split('/')[0];
    
    debug("type", mimeType)

    return <ThumbContainer key={`thumb_${i}`}>
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

function isDataURL(str) {
    return str.startsWith("data:");
}

export default Thumbs