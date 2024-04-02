import styled from '@emotion/styled'
import { useNavigate } from 'react-router-dom'
import { MOBILE_BREAKPOINT, Colors, Fonts } from '../../styles/global';
import { BackgroundImage, Container as ContainerBase, Flex } from './components';
import TopBandPresetsDesign from '../../assets/imgs/presets-linha.png'
import SwiperComponent from './Swiper';

// import Swiper styles

import Slider from "react-slick";
import '../../assets/slick.min.css'

const gridItemSize = window.innerWidth > parseInt(MOBILE_BREAKPOINT) ? 6 : 12;

const FeaturedApplicationsContent = [
    {
        title: 'AI Video',
        description: <>
            Dive into the world of AI-driven music videos crafted specifically for artists, installations, and events. We specialize in creating bespoke videos that bring your artistic visions to life.
            <br /> <br />Ideal for musicians, event organizers, and visual artists seeking to enhance their projects with unique, compelling visuals.
            <br /> <br />Let us help you transform your psychedelic ideas into stunning visual narratives.
        </>,
    },
]
const TopBand = styled.img`
position: absolute;
width: 100%;
height: auto;
right: 0;
bottom: 0;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  width: auto;
  height: 59px;
}`;

const MusicVideo = props => {

    return <Style>
        <TopBand src={TopBandPresetsDesign} />

        <Container>


            {
                FeaturedApplicationsContent.map((item, idx) => <FeaturedApp {...item} right={idx % 2} />)
            }


        </Container>
        {/*<BackgroundImage 
        src='gradient_background.png'
        zIndex='-2' 
    alt="presentation" />*/}
    </Style>
}

export default MusicVideo

const Container = styled(ContainerBase)`
  display: flex;
  flex-direction: column;
  justify-content: center;
  `

const Style = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
  z-index:0;

  display: flex;
  justify-content: center;
  background-color: ${Colors.background_body};
  padding: 1em 0;
  padding-bottom: 5em;
  `

const Headline = styled.p`
  font-family: ${Fonts.headline};
  font-style: normal;
  font-weight: 400;
  font-size: 96px;
  line-height: 105px;
  text-transform: capitalize;

  margin: 0;
  margin-top: 1em;
  color: ${Colors.offblack};

  span {
    font-family: ${Fonts.headline};
    color: ${Colors.lime};
  }

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    max-width: 600px;
    font-size: 58px;
    line-height: 55px;
    margin: 0;
    margin-top: 1em;
}`
const SubHeadline = styled.p`
    font-style: normal;
    font-weight: 400;
    font-size: 32px;
    line-height: 30px;
    text-align: center;

    /* lime */
    color: ${Colors.offblack};

    margin: 0;
    margin-bottom: 2em;
    @media (max-width: ${MOBILE_BREAKPOINT}) {
        max-width: 600px;
        font-size: 18px;
        line-height: 15px;
        margin: 0;
    }
`

const Slides = [
    { type: 'img', src: './sarkis.png' },
    { type: 'img', src: './rampue.png' },
    { type: 'img', src: './inc.png' },
    { type: 'img', src: './rampue1.png' },
]
const FeaturedApp = props => {

    const { title, subtitle, description, img, right, imgs, video } = props;



    const Media = props => {
        if (props.img) return <FeatureAppImg src={img} />;
        if (props.imgs) return <SlickSlider imgs={imgs} pad={title !== 'Busy Bee'} />;
        if (props.video) return <FeatureAppVideo src={video} playsInline autoPlay muted />;
        return <></>;
    }

    return <Flex AlignItems='center' gap='5em'>
              <Grid item xs={12}>
        <ImageURLHeading>Image Feed</ImageURLHeading>
      </Grid>
        <Grid container spacing={4}>
            <Grid item xs={gridItemSize}>
                <Headline>
                    {title}
                </Headline>
                <SubHeadline>
                    {subtitle}
                </SubHeadline>
            </Grid>
            <Grid item xs={gridItemSize}>

                <FeaturedAppStyle>
                    <p>
                        {description}
                    </p>
                </FeaturedAppStyle>
                {/* <Media {...props}/> */}
                {/* <SwiperComponent Slides={Slides}/> */}
                <iframe width="75%" height="540" src="https://www.youtube-nocookie.com/embed/HXCd1jmlL-g?si=FTz5JLj7FA8-dpZ9&amp;controls=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
                <iframe width="75%" height="540" src="https://www.youtube-nocookie.com/embed/k_W8UtOO6vQ?si=dYDFG5nHTrXpGfId&amp;controls=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
            </Grid>
        </Grid>
    </Flex>
}

const FeaturedAppStyle = styled.div`
display: flex;
flex-direction: column;
align-items: flex-start;
padding: 0 40px;

p {
    align-self: flex-start;
    font-family: 'Uncut-Sans-Variable';
    font-style: normal;
    font-weight: 400;
    font-size: 24px;
    line-height: 34px;
    margin: 0;

    color: ${Colors.offblack};
    @media (max-width: ${MOBILE_BREAKPOINT}) {
        max-width: 600px;
        font-size: 18px;
        line-height: 18px;
        margin: 0;
        text-align: center;
    }
}
`
const FeatureAppImg = styled.img`
// max-width: 500px;
width: 100%;
height: auto;
// padding: 20px;
border-radius: 0px;
`
const FeatureAppVideo = styled.video`
// max-width: 500px;
width: 100%;
height: auto;
border-radius: 0px;
`

const GridTwoColumns = styled.div`
width: 100%;
// max-width: 1110px;
align-self: center;

display: grid;
grid-template-columns: 1fr;
gap: 1em;
margin: 2em 0;

iframe {
    margin: 3em auto;
    padding: 2em 0;
}

@media (max-width: ${MOBILE_BREAKPOINT}) {
  grid-template-columns: 1fr;
}
`;




function SlickSlider({ imgs, pad }) {

    if (!imgs) return <></>;

    const settings = {
        dots: false,
        infinite: true,
        speed: 500,
        slidesToShow: 1,
        slidesToScroll: 1,
        arrows: false,
        autoplay: true,
    };

    return <Slider {...settings} style={{ width: '100%', padding: pad ? '2.5em' : '0em' }}>
        {
            imgs.map(img => <FeatureAppImg key={img} src={img} />)
        }
    </Slider>
}