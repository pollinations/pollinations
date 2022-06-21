import { Button } from "@material-ui/core"
import { useNavigate } from "react-router-dom"
import { textContent } from "../assets"
import Logo from '../components/Logo'
import MarkdownContent from "../components/molecules/MarkDownContent"
import PageTemplate from "../components/PageTemplate"
import styled from "@emotion/styled"
import { GlobalSidePadding } from "../styles/global"


export default function Home() {

  const navigate = useNavigate()

  return <HomeStyle>
      
      <Logo/>
      
      <HeroContainer>
        <MarkdownContent url={textContent.landingLeft} />
        <Button variant='contained' onClick={()=> navigate('/c')}>
            Create
        </Button>
      </HeroContainer>

      <PageTemplate label='landing' />

    </HomeStyle>
}

const HomeStyle = styled.div`
width: 100%;
padding: ${GlobalSidePadding};
padding-top: 4em;
display: flex;
flex-direction: column;
align-items: center;
`;

const HeroContainer = styled.div`
display: flex;
flex-direction: column;
justify-content: flex-start;
align-items: center;
gap: 1em;
margin: 2em;
margin-bottom: 8em;

h5 {
  color: #F9F7F0 !important;
}
button {
  background-color: #CEE480;
  :hover {
    background-color: #D5E08F;
  }
  margin-top: 3em;
}
`;
