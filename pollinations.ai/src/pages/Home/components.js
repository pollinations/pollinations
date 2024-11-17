
import { Colors, Fonts, MOBILE_BREAKPOINT } from '../../styles/global'
import styled from '@emotion/styled'


export const BackgroundImage = styled.img`
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

export const Flex = styled.div`
display: flex;
flex-direction: ${props => props.Direction || 'column'};
justify-content: ${props => props.JustifyContent || 'flex-start'};
align-items: ${props => props.AlignItems || 'flex-start'};
gap: ${props => props.Gap || 0};
`




// Decorations

export const Star = styled.img`
position: absolute;
width: 77px;
height: 77px;
`
export const LetsTalk = styled.img`
position: absolute;
width: 105px;
height: 105px;
`;

export const DecorationIMG = styled.img`
position: absolute;

width: ${ props => props.size || 50};
height: ${ props => props.size || 50};

${props => props.top && ('top:' + props.top + ';') };
${props => props.bottom && ('bottom:' + props.bottom + 'px;') };
${props => props.left && ('left:' + props.left + 'px;') };
${props => props.right && ('right:' + props.right + ';') };
`





// LINK

export const LinkStyle = styled.a`
font-family: ${Fonts.body};
font-style: normal;
font-weight: 900;
font-size: 18px;
line-height: 22px;
/* identical to box height */

text-decoration-line: underline;
text-transform: uppercase;

/* off-black */

color: ${Colors.offblack};
`



export const Container = styled.div`
width: 100%;
// max-width: 1440px;
min-height: 100vh;
`

export const OuterContainer = styled.div`
width: 100%;
display: flex;
justify-content: center;
`