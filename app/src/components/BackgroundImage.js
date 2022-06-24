import styled from '@emotion/styled'


let temp_link = 'https://media.discordapp.net/attachments/987072685131567135/987511563659382804/a_dark_fantasy_picture_of_synesthesia_stormy_universe_muted_colors_dark_mode_wallpaper_4k_trending_on_artstation.png'
let noise_ale = 'https://cdn.discordapp.com/attachments/915601448635605082/988732499893047326/probabilitydensity.jpg'
let noise_b = 'https://media.discordapp.net/attachments/915601448635605082/988731093966540821/mistmountainsoffire.png'
let carol_link = 'https://media.discordapp.net/attachments/987072685131567135/987854962530848829/holographic-gradient-of-pastel-colors_0.png?width=973&height=973'
let danae_link = 'https://media.discordapp.net/attachments/987072685131567135/987080808659562606/unknown.png'
let danae_linkB = 'https://media.discordapp.net/attachments/986173620512510023/988743677524467712/splash-07.png?width=1459&height=973'
let video = 'https://ipfs.pollinations.ai/ipfs/QmTT5TVHpns3E4yr1XBispoAErpWKzbXkVwCSj8FYRZKUb/output/video.mp4'

const ImageContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  background-image: url(${danae_linkB});
  background-size: cover;
  background-position: center;
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  z-index: -2;

  // create a :before layer just like the :after layer
  // but with a background-color: rgba(0,0,0,0.5)

  &:after {
    content: "";
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    min-height: 100%;
    background: rgba(0, 0, 0, 0.25);
    z-index: -1;
  }
  // select everything and set z-index: 5
  & * {
    // z-index: 5;
  }
`

export default ImageContainer