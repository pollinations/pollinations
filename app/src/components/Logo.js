import styled from '@emotion/styled'
import LogoLight from '../assets/logo_light_4.png'


const LogoImg = styled.img`
    max-width: ${ props => props.size || '50px'};
    margin: 1em;
    @media only screen and (max-width: 600px){
        max-width: ${ props => props.small || '90%'};
    }
`;
const Logo = props => <LogoImg src={LogoLight} size='75%' {...props}/>;

export default Logo
