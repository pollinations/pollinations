import styled from '@emotion/styled'
import { Colors, Headline, MOBILE_BREAKPOINT } from '../../styles/global'
import { useNavigate } from 'react-router-dom'
import { CTA } from './components'
// Multiple platforms Section

const PopulateMetaverses = props => {

    const navigate = useNavigate()

    return <Container>
        
        <TopTitle children='POPULATE'/>
        <Title>
            metaverses <br/>
            <span>
                Immersive experiences on the go 
            </span>
        </Title>
        <Body>
            We are developing technology to generate immersive landscapes and 3d avatars just with text or voice prompts. This is the challenge we love, and a crucial one to building  metaverses the way we want it: diverse and trippy! 

            <br/><br/>    
            Feel like learning more?
        </Body>
        
        <CTA light outlined onClick={() => navigate('/integrate')}>
            Reach out
        </CTA>
  
    </Container>
  }

  export default PopulateMetaverses

  
  const TopTitle = styled.p `
  font-family: 'Uncut Sans';
  font-style: normal;
  font-weight: 500;
  font-size: 44px;
  line-height: 55px;
  /* identical to box height */
  
  text-align: center;
  text-transform: uppercase;
  color: ${Colors.offwhite};
  margin:0;
  `
  const Title = styled.p`
  font-family: 'SERAFIN';
  font-style: normal;
  font-weight: 400;
  font-size: 90px;
  line-height: 99px;
  /* identical to box height */
  
  text-align: center;
  text-transform: capitalize;
    
  color: ${Colors.lime};
  margin:0 ;

    span {
        font-family: 'Uncut Sans';
        font-style: normal;
        font-weight: 400;
        font-size: 27px;
        line-height: 34px;
        /* identical to box height */

        text-align: center;
    }
  
`
const Body = styled.p`
/* body */
max-width: 520px;
font-family: 'Uncut Sans';
font-style: normal;
font-weight: 400;
font-size: 21px;
line-height: 30px;
text-align: left;
color: ${Colors.gray1};
margin: 0;
margin-top: 44px;
margin-bottom: 50px;
`

const Container = styled.div`
background-color: black;
display: flex;
flex-direction: column;
justify-content: center;
align-items: center;

width: 100%;
max-width: 100%;
min-height: 100vh;
position: relative;
`