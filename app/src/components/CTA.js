import { Colors, Headline, MOBILE_BREAKPOINT } from '../styles/global'
import styled from '@emotion/styled'
import { useState } from 'react';


const CTAButton = props => {
    const { outlined, light } = props;

    if (outlined) return <CtaStyle {...props} ColorScheme={light ? ColorScheme.outlinedLight : ColorScheme.outlined}  />;

    return <CtaStyle  {...props} ColorScheme={ColorScheme.contained}/>;
}
export function EmailCTA({ cta_link, cta_text, ...rest }){
  const [ text, setText ] = useState(cta_text)

  function handleClick(){
    setText(`${cta_link} copied to clipboard.`)
    navigator.clipboard.writeText(cta_link)
    setTimeout(()=>{
      setText(cta_text)
    },[1000])
  }

  return <CTAButton {...rest} onClick={handleClick}
    onMouseOver={()=>setText(`copy ${cta_link}?`)}
    onMouseOut={()=>setText(cta_text)}>
    {text}
  </CTAButton>


}

export default CTAButton

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
    font-weight: 500;
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