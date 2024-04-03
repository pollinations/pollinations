import styled from '@emotion/styled'
import { useNavigate } from 'react-router-dom'
import { Typography, ButtonGroup, Grid, Link, Box, Paper, Table, TableBody, TableCell, TableRow, TextField, CircularProgress, TableContainer, Checkbox, Tooltip, IconButton, Collapse, Button, Tabs, Tab } from '@material-ui/core';
import { MOBILE_BREAKPOINT, Colors, Fonts } from '../../styles/global';
import { GenerativeImageURLContainer, ImageURLHeading, ImageContainer, ImageStyle } from './styles';
import { BackgroundImage, Container as ContainerBase, Flex } from './components';
import SwiperComponent from './Swiper';
import Slider from "react-slick";
import '../../assets/slick.min.css'

const MusicVideo = props => {
    const videoStyles = {
        width: '100%',
        height: 'auto',
        aspectRatio: '16 / 9',
    };

    return <Flex display="flex" AlignItems='center'>
        <ImageURLHeading>AI VIDEO</ImageURLHeading>
        <PageLayout>
            <h2>Dreamt it?</h2>
            <h2 style={{color: Colors.lime}}>We visualize it.</h2>
        </PageLayout>
        <GridTwoColumns container style={{ flexWrap: 'wrap'}}>
            <div style={videoStyles}>
                <iframe style={{ width: '100%', height: '100%' }} src="https://www.youtube-nocookie.com/embed/HXCd1jmlL-g?si=FTz5JLj7FA8-dpZ9&amp;controls=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
            </div>
            <div style={videoStyles}>
                <iframe style={{ width: '100%', height: '100%' }} src="https://www.youtube-nocookie.com/embed/k_W8UtOO6vQ?si=dYDFG5nHTrXpGfId&amp;controls=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
            </div>
        </GridTwoColumns>
    </Flex>
}

const FeaturedAppStyle = styled.div`
p {
    font-family: 'Uncut-Sans-Variable';
    font-style: normal;
    font-size: 24px;
    color: ${Colors.offwhite};
    @media (max-width: ${MOBILE_BREAKPOINT}) {
        max-width: 600px;
        font-size: 18px;
        line-height: 18px;
    }
}
`
// STYLES
const PageLayout = styled.div`

h2 {
  font-family: 'Uncut-Sans-Variable';
  font-style: normal;
  font-weight: 400;
  font-size: 36px;
  display: flex;
  justify-content: center;
  color: ${Colors.offwhite};
  margin: 0;
  @media (max-width: ${MOBILE_BREAKPOINT}) {
    display: flex;
    justify-content: center;
    width: 100%;
    font-size: 36px;
  }
}`;

const GridTwoColumns = styled.div`
align-self: center;
display: grid;
grid-template-columns: 1fr 1fr;
gap: 1em;
margin: 5em 0;
margin-bottom:6em;

@media (max-width: ${MOBILE_BREAKPOINT}) {
  grid-template-columns: repeat(1, 1fr);
  width: 95%;
}

@media (min-width: ${MOBILE_BREAKPOINT}) {
  grid-template-columns: repeat(2, 1fr);
  width: 150%;
  gap: 2em;
}
`;

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
  `

const Headline = styled.p`
  font-family: ${Fonts.headline};
  font-style: normal;
  font-weight: 400;
  font-size: 96px;
  line-height: 105px;
  text-transform: capitalize;
  color: ${Colors.offwhite};

  span {
    font-family: ${Fonts.headline};
    color: ${Colors.lime};
  }

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    max-width: 600px;
    font-size: 58px;
    line-height: 55px;
}`

const SubHeadline = styled.p`
    font-style: normal;
    font-weight: 400;
    font-size: 32px;
    line-height: 30px;
    text-align: center;
    color: ${Colors.offblack};
    margin: 0;
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
}


const FeatureAppImg = styled.img`
width: 100%;
height: auto;
border-radius: 0px;
`
const FeatureAppVideo = styled.video`
width: 100%;
height: auto;
border-radius: 0px;
`
    ;




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