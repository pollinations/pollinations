import styled from '@emotion/styled'
import Logo from './Logo'

import { NavLink } from "react-router-dom"
import RouterLink from './molecules/RouterLink'

import { MAIN_NAV_ROUTES } from '../routes/publicRoutes'

import { SocialLinks } from './Social'
import { GlobalSidePadding, MOBILE_BREAKPOINT } from '../styles/global'

const Footer = () => {

return <OuterContainer>

<FooterStyle>
    <FlexColumn>
        <CTAStyle>
            Let's talk 
            <br/>
            <span> hello@pollinations.ai </span>
        </CTAStyle>
        <SocialLinks/>
    </FlexColumn>
    <NavItems>
        <NavLink to='/' style={{ padding: 0 }}>
            <Logo size='250px' small='225px' margin='0' />  
        </NavLink>
        <Items items={MAIN_NAV_ROUTES} 
            renderComponent={RouteLink} columns={1} />
    </NavItems>
</FooterStyle>
</OuterContainer> 
}
export default Footer

const OuterContainer = styled.div`
width: 100%;
display: flex;
justify-content: center;
background-color: #000000;
`
const CTAStyle = styled.p`
font-family: 'DM Sans';
font-style: normal;
font-weight: 500;
font-size: 28px;
line-height: 36px;

color: #FFFFFF;
padding-bottom: 0em;

span {
    color: #E9FA29;
}
`

const FlexColumn = styled.div`
display: flex;
flex-direction: column;
align-items: center;
`

const NavItems = styled(FlexColumn)`
padding-top: 3em;
align-items: flex-end;
gap: 1em;
@media (max-width: ${MOBILE_BREAKPOINT}) {
    align-items: center;
    padding-top: 0em;
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
justify-content: center;
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
            

const FooterStyle = styled.div`
padding: 3em 30px 0 30px;

width: 100%;
max-width: 1440px;
min-height: 418px;

display: flex;
justify-content: space-between;
flex-wrap: wrap;

@media (max-width: ${MOBILE_BREAKPOINT}) {
    flex-direction: column;
    justify-content: space-between;
    margin-bottom: 2em;
}
background-color: black;

font-family: 'DM Sans';
font-style: normal;
font-weight: 400;
font-size: 18px;
line-height: 23px;

color: #FFFFFF;

a {
    padding: 16px 0;
}
`