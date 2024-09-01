import styled from '@emotion/styled'
import { MOBILE_BREAKPOINT, Colors } from '../../styles/global';
import { Container as ContainerBase, Flex } from './components';
import Slider from "react-slick";
import '../../assets/slick.min.css'
import { ImageURLHeading } from './styles';
import { useState, useRef } from 'react';

const MusicVideo = () => {
    return (
        <Style>
            <Container>
                <Flex AlignItems='center' gap='0em'>
                    <ImageURLHeading>AI Video</ImageURLHeading>
                    <SubHeadline>Experience bespoke AI-driven music videos that bring your artistic visions to life. Perfect for musicians, event organizers, and visual artists.</SubHeadline>
                    <VideoCarousel videos={[
                        "https://www.youtube-nocookie.com/embed/HXCd1jmlL-g?si=FTz5JLj7FA8-dpZ9&amp;controls=0",
                        "https://www.youtube-nocookie.com/embed/x5XQdW87aQE?controls=0",
                        "https://www.youtube-nocookie.com/embed/k_W8UtOO6vQ?si=dYDFG5nHTrXpGfId&amp;controls=0"
                    ]} />
                </Flex>
            </Container>
        </Style>
    );
}

export default MusicVideo

const Container = styled(ContainerBase)`
  align-items: center;
`

const Style = styled.div`
  display: flex;
  justify-content: center;

`

const SubHeadline = styled.p`
  max-width: 65%;
  font-weight: 400;
  font-size: 24px;
  text-align: center;
  color: ${Colors.offwhite};
  margin: 0 0 2em;

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    max-width: 100%;
    font-size: 18px;
    margin: 0;
  }
`

function VideoCarousel({ videos }) {
    const [currentSlide, setCurrentSlide] = useState(0);
    const sliderRef = useRef(null);

    const settings = {
        dots: false,
        infinite: true,
        speed: 500,
        slidesToShow: 1,
        slidesToScroll: 1,
        arrows: false,
        autoplay: false,
        beforeChange: (oldIndex, newIndex) => setCurrentSlide(newIndex)
    };

    const next = () => {
        if (sliderRef.current) {
            sliderRef.current.slickNext();
        }
    };

    const previous = () => {
        if (sliderRef.current) {
            sliderRef.current.slickPrev();
        }
    };

    return (
        <div style={{ maxWidth: '1024px' }}>
            <Slider ref={sliderRef} {...settings} slickGoTo={currentSlide}>
                {videos.map((video, index) => (
                    <div key={index} style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                        <iframe
                            src={video}
                            title={`YouTube video player ${index}`}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            style={{ position: 'relative', border: 'none', width:'100%', maxWidth: '1024px', height: '50vw', maxHeight: '600px' }}
                        ></iframe>
                    </div>
                ))}
            </Slider>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '10px' }}>
                <StyledControl onClick={previous}>&lt;</StyledControl>
                <StyledControl> {currentSlide + 1} / {videos.length} </StyledControl>
                <StyledControl onClick={next}>&gt;</StyledControl>
            </div>
        </div>
    );
}

const StyledControl = styled.button`
    background: transparent;
    border: none;
    color: ${Colors.offwhite};
    font-size: 24px;
    cursor: pointer;
    display: flex;
    align-items: center;
`;
