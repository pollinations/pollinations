import React, { useRef, useState } from "react";
// Import Swiper React components
import { Swiper, SwiperSlide } from "swiper/react";

// Import Swiper styles
import "swiper/css";
import "swiper/css/free-mode";
import "swiper/css/navigation";
import "swiper/css/thumbs";
import styled from '@emotion/styled'
import "./styles.css";
import { MOBILE_BREAKPOINT } from '../../styles/global'
// import required modules
import { FreeMode, Navigation, Thumbs } from "swiper";





export default function SwiperComponent({ Slides }) {
  const [thumbsSwiper, setThumbsSwiper] = useState(null);
  if (!Slides) return <></>;
  return (
    <Style>
      <Swiper
        style={{
          "--swiper-navigation-color": "#fff",
          "--swiper-pagination-color": "#fff",
        }}
        loop={true}
        spaceBetween={10}
        navigation={false}
        thumbs={{ swiper: thumbsSwiper }}
        modules={[FreeMode, Navigation, Thumbs]}
        className="mySwiper2"
      >
        {
          Slides.map( (slide, i) => <SwiperSlide key={slide.src + i}>
            {
              slide.type === 'video' ?
              <video src={slide.src}/> :
              <img src={slide.src}/>
            }
          </SwiperSlide>)
        }
      </Swiper>
      <Swiper
        onSwiper={setThumbsSwiper}
        loop={true}
        spaceBetween={10}
        slidesPerView={4}
        freeMode={true}
        watchSlidesProgress={true}
        modules={[FreeMode, Navigation, Thumbs]}
        className="mySwiper"
      >
        {
          Slides.map( (slide, i) => <SwiperSlide key={slide.src + i}>
            {
              slide.type === 'video' ?
              <video src={slide.src}/> :
              <img src={slide.src}/>
            }
          </SwiperSlide>)
        }
      </Swiper>
    </Style>
  );
}

const EachSlide = ({ Slides }) => 
  Slides.map( (slide, i) => <SwiperSlide key={slide.src + i}>
    {
      slide.type === 'video' ?
      <video src={slide.src}/> :
      <img src={slide.src}/>
    }
  </SwiperSlide>)


const Style = styled.div`
max-width: 50vw;

@media (max-width: ${MOBILE_BREAKPOINT}) {
    max-width: 100vw;
  }

`