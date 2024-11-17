import styled from '@emotion/styled'

export const GlobalSidePadding = '0 3%';
export const MOBILE_BREAKPOINT = '680px';
export const HUGE_BREAKPOINT = '2560px';

export const Colors = {
  accent: 'rgb(233, 250, 41)',
  active_button: '#C93CD0',
  lime: '#FFE801',
  offwhite: '#FAFAFA',
  offblack: '#2A2C1C',
  gray1: '#B3B3B3',
  gray2: '#8A8A8A',
  background_body: '#FEFEFE',
  wine: '#670C6B',
  magenta: '#C93CD0',
  gray4: '#BDBDBD',
  white: '#FFFFFF'
};

export const Fonts = {
  body: 'Uncut-Sans-Variable',
  headline: 'SERAFIN'
}

export const BaseContainer = styled.div`
  width: 100%;
  padding: ${GlobalSidePadding};
  @media (min-width: ${HUGE_BREAKPOINT}) {
    max-width: 50%;
  }
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
font-style: normal;
font-weight: 500;
font-size: 36px;
line-height: 43px;
text-align: center;
color: #FFFFFF;
`
