import styled from '@emotion/styled'
import { BackGroundImage, GlobalSidePadding, MOBILE_BREAKPOINT } from '../../styles/global'
import CircularElement from '../../assets/imgs/rotating_thing.png'
import EndlessPossibilitiesIMG from '../../assets/imgs/endless_possibilities.png'
import { useState } from 'react'
// why we do it

const POSSIBILITIES = {
  // IllustrateSong: {
  //   label: 'Illustrate a song',
  // },
  CreateAlbumArt: {
    label: 'create album art',
    src: '/possibilities/sarkis.gif'
  },
  DreamVisualizer: {
    label: 'visualize a dream',
  },
  ArtworkDance: {
    label: 'Make your artwork dance'
  },
  CreateNfts: {
    label: 'Create NFTs'
  },
  IllustrateArticles: {
    label: 'Illustrate articles'
  },
  PsychedelicVisuals: {
    label: 'Create psychedelic visuals'
  },
  GenerateMemes: {
    label: 'Generate memes'
  },
  ChristmasCard: {
    label: 'Create an amazing christmas card'
  }
}

const EndlessPossibilites = props => {

    const [ currentItem, setCurrentItem ] = useState('')
  
    return <HeroStyle>
  
        <TitleImg src={EndlessPossibilitiesIMG}/>    
        <GridTwoColumns>
          <CarouselStyle>
            {
              Object.keys(POSSIBILITIES).map(possibilitie => {
              const { label } = POSSIBILITIES[possibilitie]
              return (
                <PossibilitieItemParagraph 
                  key={label} 
                  isActive={label === POSSIBILITIES[currentItem]?.label}
                  onClick={() => setCurrentItem(possibilitie)}>
                  {label}
              </PossibilitieItemParagraph>)
              })
            }
          </CarouselStyle>
            <img src={POSSIBILITIES[currentItem]?.src}/>
          </GridTwoColumns>
        <RotatingThing src={CircularElement} />
    
    </HeroStyle>
  }

export default EndlessPossibilites

const CarouselStyle = styled.div`
display: flex;
justify-content: center;
`

const PossibilitieItemParagraph = styled.p`
  writing-mode: vertical-lr;
  transform: rotate(180deg);
  text-align: center;
  cursor: pointer;
  min-height: 200px;
  ${ props => props.isActive && 'border: 2px solid red; border-radius: 50%; padding: 0.5em;'}
`

const TitleImg = styled.img`
width: 40%;
margin-top: 5em;
margin-bottom: 2em;
`

const RotatingThing = styled.img`
width: 200px;

position: absolute;
top: auto;
left: 20;

margin-top: 80vh;


animation: rotation 20s infinite linear;
@keyframes rotation {
from {
    transform: rotate(0deg);
}
to {
    transform: rotate(359deg);
}
}
`
  
const GridTwoColumns = styled.div`
width: 100%;
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
align-items: center;
margin-top: 2em;

`
const HeroStyle = styled.div`
min-height: 100vh;
display: flex;
flex-direction: column;
align-items: center;

width: 100%;
padding: ${GlobalSidePadding};

background-size: cover;
background-position: center;

`;