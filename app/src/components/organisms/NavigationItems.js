import RouterLink from '../molecules/RouterLink'
import styled from '@emotion/styled'
import { MOBILE_BREAKPOINT } from '../../styles/global'

const NavigationItems = ({ navRoutes, column, margin, gap }) => {

    const nav_items = Object.keys(navRoutes).map((key) => (
        <RouterLink key={key} to={navRoutes[key].to}>
            {navRoutes[key].label}
        </RouterLink>
    ));

    if (column) return <VerticalStyle margin={margin} gap={gap}>
        {nav_items}
    </VerticalStyle>

    return <HorizonalStyle>
        {nav_items}
    </HorizonalStyle>
}

export default NavigationItems

const HorizonalStyle = styled.div`
grid-area: nav;
align-self: center;
list-style: none;

display: flex;
justify-content: center;
align-items: center;
width: 100%;
gap: 2.7em;

overflow-y: hidden;
background-color: transparent;

@media only screen and (max-width: ${MOBILE_BREAKPOINT}){
display: none;
}

font-family: 'DM Sans';
font-style: normal;
font-weight: 500;
font-size: 17px;
line-height: 23px;
text-align: center;

color: #FFFFFF;


`
const VerticalStyle = styled.div`
grid-area: nav;
list-style: none;
text-transform: uppercase;

padding: 0.5em 0.5em;
text-align: center;

display: flex;
flex-direction: column;
gap: ${props => props.gap || ''};
margin: ${props => props.margin || ''};
a {
    font-family: 'DM Sans';
    font-style: normal;
    font-weight: 500;
    font-size: 24px;
    line-height: 31px;
    text-align: center;

    text-transform: capitalize;

    color: #FFFFFF;
}

li {
    padding: 1em 0em;
}
`