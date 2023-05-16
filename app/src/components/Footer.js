import styled from '@emotion/styled'
import Logo from './Logo'

import { NavLink } from "react-router-dom"
import RouterLink from './RouterLink'

import { MAIN_NAV_ROUTES } from '../routes/publicRoutes'

import { SocialLinks } from './Social'
import { Colors, MOBILE_BREAKPOINT, HUGE_BREAKPOINT, BaseContainer } from '../styles/global'

const Footer = () => {

return <OuterContainer>
    <FooterStyle>
        <LetsTalkStyle>
            Let's talk 
            <br/>
            <span> hello@pollinations.ai </span>
        </LetsTalkStyle>
        <SocialContainer>
            <SocialLinks gap='17px' />
        </SocialContainer>
        <LogoContainer>
            <NavLink to='/' >
                <Logo size='250px' small='225px' margin='0' />  
            </NavLink>
        </LogoContainer>
        <NavigationContainer>
            <Items 
                items={MAIN_NAV_ROUTES} 
                renderComponent={RouteLink} 
                columns={1} />
        </NavigationContainer>
    </FooterStyle>
</OuterContainer> 
}
export default Footer

const OuterContainer = styled.div`
width: 100%;
display: flex;
justify-content: center;
background-color: black;
`
const SocialContainer = styled.div`
grid-area: social;
justify-self: flex-start;

`
const LogoContainer = styled.div`
grid-area: logo;
justify-self: flex-end;

padding-top: 70px;
@media only screen and (max-width: ${MOBILE_BREAKPOINT}){
    justify-self: center;
}
`
const NavigationContainer = styled.div`
grid-area: navigation_footer;
justify-self: flex-end;

@media only screen and (max-width: ${MOBILE_BREAKPOINT}){
    justify-self: center;
    margin-bottom: 205px;
}
`



const LetsTalkStyle = styled.p`
grid-area: lets-talk;
justify-self: flex-start;

font-style: normal;
font-weight: 500;
font-size: 28px;
line-height: 36px;

color: ${Colors.offwhite};
padding-bottom: 0em;
@media only screen and (max-width: ${MOBILE_BREAKPOINT}){
    margin-left: 24px;
}

`


const Items = ({ items, renderComponent, columns }) => 
    split(Object.keys(items), columns).map( col =>
        <ItemsStyle>
            { col.map(renderComponent) }
        </ItemsStyle>
    )
;
const ItemsStyle = styled.div`


display: flex;
gap: 3em;
width: 100%;
`
        

function split(array, cols) {
    if (cols === 1) return [array];
    var size = Math.ceil(array.length / cols);
    return [
        array.slice(0, size)]
        .concat(
            split(
                array
                .slice(size), cols-1)
        );
}

const RouteLink = (route) => {
    const { to, label } = MAIN_NAV_ROUTES[route];
    return (
        <RouterLink
            key={`plt_link_${route}`}
            to={to}
            >
            {label}
        </RouterLink>
    )
}
            

const FooterStyle = styled(BaseContainer)`
padding: 3em 86px 0 86px;

width: 100%;
min-height: 418px;

display: grid;
grid-template-columns: 1fr 1fr;

grid-template-areas: 
    "lets-talk logo"
    "social navigation_footer"
;

@media (max-width: ${MOBILE_BREAKPOINT}) {
    grid-template-columns: 1fr;
    grid-template-areas: 
    "logo"
    "navigation_footer"
    "lets-talk"
    "social"
    ;
    padding: 0;
    margin-bottom: 2em;
    max-width: 414px;
}
background-color: black;

font-style: normal;
font-weight: 400;
font-size: 18px;
line-height: 23px;

color: #FFFFFF;

a {
    padding: 16px 0;
}
`