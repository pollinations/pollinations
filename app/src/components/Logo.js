import styled from '@emotion/styled'
import LogoLight from '../assets/logo_light_4.png'
import { ImageURLHeading } from '../pages/Home/styles';


const LogoImg = styled.img`
    max-width: ${props => props.size || '50px'};
    margin: ${props => props.margin || '1em 0'};
    @media only screen and (max-width: 600px){
        max-width: ${props => props.small || '90%'};
    }
    filter: invert(100%);
`;
const Logo = props => <LogoImg src={LogoLight} size='75%' {...props} />;
const Logo2 = props => <ImageURLHeading
    width={200}
    height={50}
    whiteText={false}
    style={{
        maxWidth: props.size || '50px',
        margin: props.margin || '1em 0',
    }}
> Pollinations</ImageURLHeading >;
export default Logo;
