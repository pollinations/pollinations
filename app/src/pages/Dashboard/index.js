import { getCurrentUser } from '../../supabase/user'
import Chart from './chart'
import styled from '@emotion/styled'
import { BackGroundImage, Colors, Fonts, MOBILE_BREAKPOINT } from '../../styles/global';
import whyBG from '../../assets/imgs/BG7.png'
import NavigationItems from '../../components/organisms/NavigationItems'
import { Outlet, NavLink } from 'react-router-dom';

const AdminRoutes = [
  {
    id: 'usage',
    label: 'Usage',
    to: '/d/usage'
  },
  {
    id: 'billing',
    label: 'Billing',
    to: '/d/billing',
    children: [
      {
        id: 'billing_history',
        label: 'History',
        to: '/d/billing/history'
      },
      {
        id: 'billing_pref',
        label: 'Preferences',
        to: '/d/billing/preferences'
      }
    ]
  },
  {
    id: 'token',
    label: 'API Token',
    to: '/d/token'
  }
]


const NavLinkWithChildren = (route) => {


  return <>
    <NavLink
      to={route.to} 
      children={route.label} 
      style={({isActive})=> ({ color: isActive ? Colors.lime : Colors.offwhite})}
    />
    {
      route.children.map( subroute => <SubRouteStyle>
        <NavLink key={subroute.id}
          to={subroute.to} 
          children={subroute.label} 
          style={({isActive})=> ({ color: isActive ? Colors.lime : Colors.offwhite})}
        />
        </SubRouteStyle>
        )
    }
  </>
}

const SubRouteStyle = styled.div`
a{
  font-style: normal;
    font-weight: 500;
    font-size: 18px;
    line-height: 31px;
    text-align: left;

    text-transform: capitalize;

    color: #FFFFFF;
    text-decoration: none;
    margin-left: 1em;
    :hover{
      text-decoration: underline;
    }
`

export default function AdminArea(){
    return <Style>
  <ContainerStyle>
    <NavStyle>
      {
        AdminRoutes.map( route => 
          !route.children ?
          <NavLink key={route.id}
            to={route.to} 
            children={route.label} 
            style={({isActive})=> ({ color: isActive ? Colors.lime : Colors.offwhite})}
          />
          :
          <NavLinkWithChildren {...route}/>
      )}
    </NavStyle>
    <Container>
      <Outlet/>
    </Container>
  </ContainerStyle>
  <BackGroundImage 
    src={whyBG} 
    top='auto'
    zIndex='-1' 
    objectPosition='0 30%'
    alt="hero_bg_overlay" />
  </Style>
}
const NavStyle = styled.nav`
display: flex;
flex-direction: column;
justify-content: flex-start;
padding-left: 2em;
a{
  font-style: normal;
    font-weight: 500;
    font-size: 24px;
    line-height: 31px;
    text-align: left;

    text-transform: capitalize;

    color: #FFFFFF;
    text-decoration: none;
    :hover{
      text-decoration: underline;
    }
}

`
const Container = styled.div`
width: 100%;

position: relative;

background: linear-gradient(90.41deg, rgba(255, 255, 255, 0.17) 1.53%, rgba(255, 255, 255, 0.1) 98.72%);
box-shadow: 0px 4px 24px -1px rgba(0, 0, 0, 0.17);
backdrop-filter: blur(15px);
border-radius: 20px;

padding: 3em ;
`;
const Style = styled.div`
width: 100%;
height: 100%;
padding: 0em;
margin: 0;
display: flex;
flex-direction: column;
align-items: flex-start;
justify-content: flex-start;
`;

const ContainerStyle = styled.div`
display: grid;
grid-template-columns: 1fr 6fr 1fr;
gap: 3em;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  gap: 1em;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr 1fr 1fr;
}

width: 100%;
height: 100%;
margin-top: 3em;
padding: 2em;
`