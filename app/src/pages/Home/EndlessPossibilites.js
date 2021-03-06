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
  CreateNfts: {
    label: 'create nfts',
    src: '/possibilities/nft-min.gif'
  },
  DreamVisualizer: {
    label: 'visualize a dream',
    src: '/possibilities/dreams-min.gif'
  },
  // ArtworkDance: {
  //   label: 'make your artwork dance',
  //   src: '/possibilities/sarkis-min.gif'
  // },
  IllustrateArticles: {
    label: 'illustrate articles',
    src: '/possibilities/article.jpg'
  },
  CreateAlbumArt: {
    label: 'create album art',
    src: '/possibilities/sarkis-min.gif'
  },
  PsychedelicVisuals: {
    label: 'create psychedelic visuals',
    src: '/possibilities/psychedelic.jpg'
  },
  GenerateMemes: {
    label: 'generate memes',
    src: '/possibilities/meme.png'
  },
  // ChristmasCard: {
  //   label: 'Create an amazing christmas card',
  //   src: '/possibilities/sarkis.gif'
  // }
}

const EndlessPossibilites = props => {

    const [ currentItem, setCurrentItem ] = useState('CreateAlbumArt')
  
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
          <PossibilitieItemImg >
            <img src={POSSIBILITIES[currentItem]?.src} />
          </PossibilitieItemImg>
          </GridTwoColumns>
        <RotatingThing src={CircularElement} />
          
    
    </HeroStyle>
  }

export default EndlessPossibilites

const CarouselStyle = styled.div`
align-self: flex-start;
justify-self: self-end;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  justify-self: center;
}
margin-top: 5em;

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
const PossibilitieItemImg = styled.div`
width: 100%;
margin-bottom: -2em;
display: flex;
justify-content: center;
img {
  object-fit: contain;
  max-width: 100%;
  height: 400px;
}
`

const TitleImg = styled.img`
width: 80%;
max-width: 500px;

margin-top: 5em;
margin-bottom: 2em;
`

const RotatingThing = styled.img`


width: 200px;
margin-bottom: 2em;
align-self: flex-start;

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

display: flex;
flex-direction: column;
align-items: center;

width: 100%;
max-width: 1200px;
padding: ${GlobalSidePadding};

background-size: cover;
background-position: center;

`;