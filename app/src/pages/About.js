import TempLayout from '../components/layouts/Temp'

const About = props => 
  <TempLayout Content={Content}/>;

export default About

const Content = [
  {
    headline: 'About',
    content: <> 
      Pollinations is a platform to generate media with the help of AI. 
      Here you can create customized, royalty-free pieces of audio, images, 3D objects and soon fully immersive 3D environments on the fly.
      We offer cutting-edge AI models that are constantly being updated. Every creation is unique and free to use.
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