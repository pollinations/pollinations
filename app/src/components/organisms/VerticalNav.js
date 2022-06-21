import styled from '@emotion/styled'
import { MOBILE_BREAKPOINT } from '../../styles/global'
import RouterLink from '../molecules/RouterLink'



const VerticalNav = ({ navRoutes }) =>{

    return <MenuItems direction='column'>
    {
        Object.keys(navRoutes).map((key) => (
        <li key={key}>
        <RouterLink key={key} to={navRoutes[key].to}>
            {navRoutes[key].label}
        </RouterLink>
        </li>
    ))}
    </MenuItems>
}

export default VerticalNav

const MenuItems = styled.div`

list-style: none;
gap: 2em;
padding: 0.5em 0.5em;
text-align: center;

text-transform: uppercase;

li {
    padding: 1em 0em;
}

`