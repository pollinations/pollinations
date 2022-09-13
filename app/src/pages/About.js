import { Link } from 'react-router-dom';
import TempLayout from '../components/layouts/Temp'

const About = props => 
  <TempLayout Content={Content}/>;

export default About

const Content = [
  {
    headline: 'About',
    content: <> 
      Pollinations wants to diversify creativity and spread it through digital ecosystems. 
      Whether in image, video, audio or 3d objects, the idea is to invite people to imagine new worlds 
      with the help of AI. Besides offering cutting-edge AI models that are constantly being updated, 
      we write code on top of these models allowing for customized outcomes and specific aesthetics.
      <br/> <br/>
      With our API, personalized AI models can be integrated directly within games, metaverses and social 
      media, making AI media generation easy, fast, and fun. Alternatively, our AI could be deployed as a 
      tool into 3d modelers workflow.
      <br/> <br/>
      Get in touch with us if you’d like to offer this kind of experience. 
      See <Link to='/solutions' children='here' style={{color: 'black'}}/> how it works or send us a hello at hello@pollinations.ai.
      </>,
  },
  {
    headline: 'Why',
    content: <>
      The need to design digital worlds is rising fast, 
      but the power and skills to actually build these worlds are concentrated in the hands of a few people. 
      The cost is so high, and the process too time-consuming, making experimentation difficult. 
      We believe the metaverse should be trippy, and we want it to be built by diverse minds, 
      so <b>we developed an interface that makes AI media creation easy and fast.</b>
      </>,
  },
  {
    headline: 'Who',
    content: <>
      We are a deep-tech company based in Berlin. Our team of machine-learning specialists, 
      artists and futurists is profoundly involved in the AI ecosystem. 
      The AI models we offer are open-source, and are constantly updated by a thriving community.
    </>
  }
];