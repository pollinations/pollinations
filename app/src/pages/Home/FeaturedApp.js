import styled from '@emotion/styled'
import { useNavigate } from 'react-router-dom'
import { BackGroundImage, MOBILE_BREAKPOINT, Colors } from '../../styles/global';
import BgImg from '../../assets/imgs/gradient-background.png'
import DataNationImg from '../../assets/imgs/datanation_img.png'
import DreaMachineImg from '../../assets/imgs/dreamachine.png'
import AvatarImg from '../../assets/imgs/avatar_img.png'

// why we do it


const FeaturedApps = props => {
  const navigate = useNavigate()
  
    return <HeroStyle>

        <HeroHeadline>
            <span>
                FEATURED
            </span>
            <br/>
            APPLICATIONS
        </HeroHeadline>

        {
            Content.map( (item, idx) => <FeaturedApp {...item} right={idx%2} />)
        }

      <BGimage src={BgImg} zIndex='-2' />
    
    </HeroStyle>
  }

  export default FeaturedApps
  const BGimage = styled(BackGroundImage)`
  height: 100%;
  @media (max-width: ${MOBILE_BREAKPOINT}) {
  height: auto;
  min-height: 100vh;
  }
  `
  const HeroHeadline = styled.p`
  font-family: 'SERAFIN';
  font-style: normal;
  font-weight: 400;
  font-size: 92px;
  line-height: 94px;
  text-transform: capitalize;

  margin: 0;
  margin-top: 131px;
  margin-left: 87px;

  color: ${Colors.offWhite};

  span {
    color: ${Colors.lime};
  }

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    max-width: 600px;
    font-size: 38px;
    line-height: 35px;
}`

const Content = [
    {
        title: 'NFT series generator',
        subtitle: 'Build a strong hive',
        description: <> Our models allow the creation of infinite pieces of media according to your aesthetics, so they are perfect NFT series creators! <br/><br/> Antropomorphic animals wearing different accessories? Sure! <br/> Pixelated portraits? Yes! </>,
        img: DataNationImg
    },
    {
        title: 'Busy Bee',
        subtitle: 'Create. Bond. Have fun!',
        description: <> Add our bot to Twitter, Discord or any social media platform. Your members can then post a text and receive back an image created on the spot! Increase engagement, turn your community into the place to be. </>,
        img: AvatarImg
    },
    {
        title: 'Pollinations Studio',
        subtitle: 'Immerse yourself into a flow of dreams',
        description: <>We offer commissioned works such as music videos, immersive installations, interactive experiences and more.</>,
        img: DreaMachineImg
    },
]

const FeaturedApp = props => {

    const { title, subtitle, description, img, right } = props;

    return <GridTwoColumns>
        { !right ? <FeatureAppImg src={img}/> : <></> }

        <FeaturedAppStyle>
            <h1>
                {title}
            </h1>
            <h2>
                {subtitle}
            </h2>
            <p>
                {description}
            </p>
        </FeaturedAppStyle>

        { right ? <FeatureAppImg src={img}/> : <></> }

    </GridTwoColumns>
}
const FeaturedAppStyle = styled.div`
display: flex;
flex-direction: column;
align-items: flex-start;
justify-content: center;
gap: 10px;
padding: 0 40px;

h1, h2, p {
    font-family: 'Uncut-Sans-Variable';
}
h1 {
    font-style: normal;
    font-weight: 700;
    font-size: 42px !important;
    line-height: 52px;
    color: ${Colors.offWhite};
    margin: 0;
    margin-bottom: 8px;
}
h2 {
    font-style: normal;
    font-weight: 500;
    font-size: 28px;
    line-height: 35px;
    /* identical to box height */


    /* lime */
    color: ${Colors.lime};

    margin: 0;
    margin-bottom: 30px;
}
p {
    font-style: normal;
    font-weight: 400;
    font-size: 21px;
    line-height: 30px;
    margin: 0;
    /* gray 1 */

    color: ${Colors.gray1};


    /* Inside auto layout */

    flex: none;
    order: 1;
    flex-grow: 0;
}
`
const FeatureAppImg = styled.img`
width: 520px;
height: auto;
`

const GridTwoColumns = styled.div`
width: 100%;
max-width: 1110px;
position: relative;
align-self: center;

display: flex;
flex-direction: row;
align-items: flex-start;
padding: 0px;
gap: 70px;
margin: 250px 0;

@media (max-width: ${MOBILE_BREAKPOINT}) {
  padding: 10em 1.5em;
}

`
const HeroStyle = styled.div`
display: flex;
flex-direction: column;

width: 100%;
position: relative;
padding: 0em 0 10em 0;

`;
