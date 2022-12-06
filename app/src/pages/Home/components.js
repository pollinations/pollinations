
import { Colors, Headline, MOBILE_BREAKPOINT } from '../../styles/global'
import styled from '@emotion/styled'


export const CTA = props => {
const { outlined, light } = props;

if (outlined) return <CtaStyle {...props} ColorScheme={light ? ColorScheme.outlinedLight : ColorScheme.outlined}  />;

return <CtaStyle  {...props} ColorScheme={ColorScheme.contained}/>;
}



const CtaStyle = styled.button`
    background: transparent;
    cursor: pointer;
    /* button */

    box-sizing: border-box;

    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    padding: 15px 30px;
    gap: 10px;

    border-radius: 40px;
    
    font-family: 'Uncut-Sans-Variable';
    font-style: normal;
    font-weight: 700;
    font-size: 16px;
    line-height: 20px;  
    text-transform: uppercase;
    
    ${props => props.ColorScheme}
  `

  const ColorScheme = {
    contained: `
    border: 0;
    color: ${Colors.offblack};
    `,
    outlined: `
    border: 1px solid ${Colors.gray2}; 
    color: ${Colors.offblack};
    `,
    outlinedLight: `
    border: 1px solid ${Colors.lime};
    color: ${Colors.offwhite};
    `
  }


// Decorations

export const Star = styled.img`
position: absolute;
width: 77px;
height: 77px;
${ props => props.Top ? `
  top: 71px;
  right: 85px;
  ` : `
  left: 87px;
  bottom: 69px;`
}
`
export const LetsTalk = styled.img`
position: absolute;
width: 105px;
height: 105px;
top: 71px;
right: 85px;
`;





// LINK

export const LinkStyle = styled.a`
font-family: 'Uncut Sans';
font-style: normal;
font-weight: 700;
font-size: 18px;
line-height: 22px;
/* identical to box height */

text-decoration-line: underline;
text-transform: uppercase;

/* off-black */

color: ${Colors.offblack};
`



export const Container = styled.div`
max-width: 1440px;
display: flex;
flex-direction: column;
justify-content: center;
align-items: center;
${props => props.content === 'about' && 'padding: 9%; align-items: flex-start;'}

`