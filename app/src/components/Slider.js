import styled from '@emotion/styled';
import { Button, LinearProgress } from '@material-ui/core';
import React, { useEffect } from 'react';
import RouterLink from './molecules/RouterLink';
import { NotebookImgUrl } from './organisms/markdownParsers/NotebookImage';

const Slider = (props) => {

const [position, setPosition] = React.useState(0);
const element = document.getElementById('Slider');

useEffect(() => {

  if (!element) return;
  
  const updatePosition = () => {
    setPosition((element.scrollLeft / element.scrollLeftMax)*100)
  }
  element.addEventListener("scroll", updatePosition);
  updatePosition();
  return () => element.removeEventListener("scroll", updatePosition);
},[element]);

return <>
  <Row id='Slider'>
    <SliderContainer>
      {props.children}
    </SliderContainer>
  </Row>
</> 
}
export default Slider;


export const Slide = ( notebook ) => {

  let { category, name, path, description } = notebook;

  // remove credits etc (they are separated by a horizontal rule)
  
  // parse category
  // const parsedCategory = category?.slice(2)
  //   .replace('-', ' ')
  //   .replace('-', ' ')
  //   .toLowerCase();

  return (
    <div >
      <RouterLink to={path}>
        <ModelIMG metadata={notebook}/>

        <InfoStyle>
          <h2 style={{margin: '0.5em 0'}}>
            {name?.slice(2)}
          </h2>
          {/* <NotebookInfo description={description?.split("---")[0]} noImg /> */}
        </InfoStyle>
      </RouterLink>
    </div>
  )
}


// Text
const InfoStyle = styled.div`
width: 100%;
padding: 0em;

display: flex;
flex-direction: column;
justify-content: flex-end;
`


// Image
const ModelIMG = ({ metadata }) => <ModelImgStyle src={NotebookImgUrl(metadata)} />

const ModelImgStyle = styled.div`
background: url(${props => props.src});
background-size: cover;
width: ${window.innerWidth * 0.25}px;
max-height: 500px;
object-fit: cover;
height: 300px;
aspect-ratio: 1/1;
`



const Row = styled.div`
 
  overflow-y: hidden;
  overflow-x: scroll;
  

  ::-webkit-scrollbar {
    display: none ;
  }

  // implement fallback
  scrollbar-width: none;
  
`

const SliderContainer = styled.div`
  
  display: flex;
  flex-grow: 1;
  
  div { padding: 0.25rem; }  
`