import RouterLink from '../molecules/RouterLink'
import styled from '@emotion/styled'
import { MOBILE_BREAKPOINT } from '../../styles/global'

const NavigationItems = ({ navRoutes, column }) => {

    const nav_items = Object.keys(navRoutes).map((key) => (
        <RouterLink key={key} to={navRoutes[key].to}>
            {navRoutes[key].label}
        </RouterLink>
    ));

    if (column) return <VerticalStyle>
        {nav_items}
    </VerticalStyle>

    return <HorizonalStyle>
        {nav_items}
    </HorizonalStyle>
}

export default NavigationItems

const HorizonalStyle = styled.div`
list-style: none;

display: flex;
justify-content: flex-end;
align-items: center;
width: 100%;
gap: 2em;
padding: 0.5em 0em;
overflow-y: hidden;
background-color: transparent;
text-transform: uppercase;

@media only screen and (max-width: ${MOBILE_BREAKPOINT}){
display: none;
}
`
const VerticalStyle = styled.div`
list-style: none;
text-transform: uppercase;

padding: 0.5em 0.5em;
text-align: center;

display: flex;
flex-direction: column;

li {
    padding: 1em 0em;
}
`