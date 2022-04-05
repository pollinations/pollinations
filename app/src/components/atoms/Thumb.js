import styled from '@emotion/styled'

const Thumb = styled.div`
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

const Thumbs = ({ files, type }) => <Container>
    {
        files.map(file => 
        <Thumb key={file?.name}>
            <div>
                {
                    (type === 'video' && <video src={file?.preview} autoPlay controls/>)
                    ||
                    (type === 'image' && <img src={file?.preview} />)
                }
            </div>
        </Thumb>
        )
    }
</Container>;

export default Thumbs