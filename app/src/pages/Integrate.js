import TempLayout from '../components/layouts/Temp'
import styled from '@emotion/styled';
import { Colors } from '../styles/global';

const Integrate = props => 
  <TempLayout Content={Content}/>;

export default Integrate
const Style = styled.div`
span {
  color: ${Colors.accent};
}
`
const Content = [
  {
    headline: 'Integrate',
    content: <Style> Imagine a gaming platform in which players can <b>create 3D objects</b> inside the game just by typing a few words into a box, or an NFT marketplace in which users can <b>create and mint NFTs</b> on the spot.
    <br/><br/>
  
    By integrating with Pollinations’ API users can create all of this and much more <b> without switching platforms.</b> We offer <b>presets and looks</b> so that all media created can have the visual identity of your brand.
    <br/><br/>

    Music platforms, NFTs, articles about emerging technology, luxury hotels, 3D object stores and many more are getting a touch of magic with Pollinations’ AI-power. <span>Let us hear about your goals too.</span>
    </Style>,
  },
  {
    headline: <> Build <br/>community<br/> through <br/> AI art </>,
    content: <Style>
    Imagine that within Discord or Slack people can write a prompt to a bot and get the exact media they want. They can create challenges, NFTs, games and much more, making for a fun, interactive, artistic experience. <span>Send us a hello</span> to see what this looks like.
    </Style>,
  }
];