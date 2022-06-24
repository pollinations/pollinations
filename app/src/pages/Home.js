import Button from '../components/atoms/StyledButton'
import { useNavigate } from "react-router-dom"
import { textContent } from "../assets"
import Logo from '../components/Logo'
import MarkdownContent from "../components/molecules/MarkDownContent"
import PageTemplate from "../components/PageTemplate"
import styled from "@emotion/styled"
import { GlobalSidePadding, MarkDownStyle } from "../styles/global"
import { BaseContainer } from "../styles/global"


export default function Home() {

  const navigate = useNavigate()

  return <HomeStyle>
      
      <Logo size='65%' margin='7em 0 0 0'/>
      
      <HeroContainer>
        <MarkdownContent url={textContent.landingLeft} />
        <Button onClick={()=> navigate('/c')}>
            Create
        </Button>
      </HeroContainer>
      <MarkDownStyle>
        <PageTemplate label='landing' />
      </MarkDownStyle>

    </HomeStyle>
}

const HomeStyle = styled(BaseContainer)`
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
button{
  margin-top: 3em;
}
`;

