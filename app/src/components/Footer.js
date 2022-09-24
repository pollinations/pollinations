import styled from '@emotion/styled'

import Logo from './Logo'

import { NavLink } from "react-router-dom"
import RouterLink from './molecules/RouterLink'
import Link from '@material-ui/core/Link'

import { SOCIAL_LINKS } from '../_globalConfig/socialLinks'
import { MAIN_NAV_ROUTES } from '../routes/publicRoutes'

import { SocialLinks } from './Social'

const Footer = () => {

return <FooterStyle>
    <div style={{display:'flex', flexDirection:'column'}}>
        <Items items={MAIN_NAV_ROUTES} 
            renderComponent={RouteLink} columns={1} />

        {/* <Items items={SOCIAL_LINKS} 
            renderComponent={PlatformLink} columns={2} /> */}

        <SocialLinks>

        </SocialLinks>
    </div>

    <NavLink to='/' style={{ padding: 0 }}>
        <Logo size='250px' small='150px' margin='0' />  
    </NavLink>
</FooterStyle>
}
export default Footer


const Items = ({ items, renderComponent, columns }) => 
    split(Object.keys(items), columns).map( col =>
        <div key={`col_${col}`}>
            { col.map(renderComponent) }
        </div>
    )
;
        

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


const PlatformLink = (platform) => {
    const { url, label } = SOCIAL_LINKS[platform]
    return (
      <Link
        key={`plt_link_${platform}`}
        href={url}
        target="_blank"
      >
        {label}
      </Link>
    )
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

width: 100%;
min-height: 415px;
display: flex;
justify-content: space-between;

padding: 4em 3% 140px;
padding-top: 4em;
background-color: black;

font-family: 'DM Sans';
font-style: normal;
font-weight: 400;
font-size: 18px;
line-height: 23px;

color: #FFFFFF;

div {
    min-width: 50%;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    align-items: flex-start;
}
a {
    padding: 16px 0;
}
`