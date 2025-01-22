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
  body: 'Zapfino, fantasy',
  title: 'Monospace, monospace',
  headline: 'Monospace, monospace',
  parameter: 'Courier New, monospace',
}

//   headline: 'Monospace, monospace',

// Step 1: Create a new mapping object for section backgrounds
export const SectionBG = {
  header: Colors.offwhite,       
  hero: Colors.offwhite,
  news: backgroundImage1,         
  feedImage: backgroundImage3,   
  integration: backgroundImage2, 
  community: backgroundImage5,   
  project: backgroundImage4,     
  team: backgroundImage7,
  supporter: backgroundImage6,        
  footer: Colors.offwhite       
}
