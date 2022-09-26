import styled from '@emotion/styled'

export const GlobalSidePadding = '0 3%';
export const MOBILE_BREAKPOINT = '768px';

export const Colors = {
  accent: 'rgb(233, 250, 41)'
};

export const BaseContainer = styled.div`
  width: 100%;
  padding: ${GlobalSidePadding};
`;

export const MarkDownStyle = styled.div`
h6 {
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1.6;
  color: #fdfdfd;
}
p{
  font-size: 1.1rem;
  line-height: 1.43;
  color: #fdfdfd;
}
`
export const SmallContainer = styled.div`
min-width: 20%;
max-width: 600px;
margin: auto;
margin-bottom: 7em;
padding: ${GlobalSidePadding};
`
export const GridStyle = styled.div`
display: grid;
grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
grid-gap: 1em;
`

export const BackGroundImage = styled.img`
position: ${props => props.position ? props.position : 'absolute'};
width: 100%;
height: 100%;
top: ${props => props.top || 0};
left: 0;
opacity: ${props => props.opacity || 1};
z-index: ${props => props.zIndex || 0};
mix-blend-mode: ${props => props.blend || 'normal'};
transform: ${props => props.transform || ''};
object-fit: cover;
object-position: ${props => props.objectPosition || ''};
`
export const Headline = styled.p`
font-family: 'Mattone';
font-style: normal;
font-weight: 500;
font-size: 36px;
line-height: 43px;
text-align: center;

color: #FFFFFF;
`
