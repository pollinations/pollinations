import backgroundImage1 from "../assets/background/01.webp"
import backgroundImage2 from "../assets/background/02.webp"
import backgroundImage3 from "../assets/background/03.webp"
import backgroundImage4 from "../assets/background/04.webp"
import backgroundImage5 from "../assets/background/05.webp"
import backgroundImage6 from "../assets/background/06.webp"
import backgroundImage7 from "../assets/background/07.webp"
import backgroundImage8 from "../assets/background/08.webp"



export const SHOW_PROMPT_TOOLTIP = false; 

export const Colors = {
  lime: '#FFE801',
  offwhite: '#FAFAFA',
  offblack: '#1a1a1a', 
  offblack2: '#3b3b3b',
  gray1: '#B3B3B3',
  gray2: '#8A8A8A',
};

export const Fonts = {
  body: 'Zapfino',
  title: 'Maven Pro',
  headline: 'Monospace, monospace',
  parameter: 'Courier New',
}

//   headline: 'Monospace, monospace',

// Step 1: Create a new mapping object for section backgrounds
export const SectionBG = {
  header: {
    color: Colors.offwhite,
    gradient: false,
  },
  hero: {
    color: Colors.offwhite, 
    gradient: false,
  },
  news: {
    color: Colors.offwhite,
    gradient: false,
  },
  feedImage: {
    image: backgroundImage1,
    gradient: true,
  },
  integration: {
    color: Colors.offblack,
    gradient: false,
  },
  community: {
    image: backgroundImage5,
    gradient: true,
  },
  project: {
    color: Colors.offblack,
    gradient: false,
  },
  team: {
    image: backgroundImage3,
    gradient: true,
  },
  supporter: {
    color: Colors.offblack,
    gradient: false,
  },
  footer: {
    color: Colors.offwhite,
    gradient: false,
  }
}
