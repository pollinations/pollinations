import { newsList } from "../config/newsList"

import team1 from "../assets/team/Thomas.webp"
import team2 from "../assets/team/Elliot.webp"
import team3 from "../assets/team/Laurent.jpeg"
import team4 from "../assets/team/Nico.jpeg"
import team5 from "../assets/team/Portrait_XO.webp"
import team6 from "../assets/team/Kalam.webp"
import { rephrase } from "./llmTransforms"

// 1) Base building blocks
export const context = `The text appears on the website Pollinations.AI. Pollinations.AI is an open-source generative AI startup based in Berlin that allows creating different types of media using AI models.`

// 4) Use combos throughout
export const HERO_INTRO = 
  "Introduce our open-source platform that provides easy-to-use text and image generation APIs. It requires no sign-ups or API keys, prioritizing user privacy and anonymity. 20 words maximum."


export const HERO_CTO = 
  "Talk to us, reach out. "

export const HERO_EMAIL_BUTTON = "hello@pollinations.ai"
export const HERO_GITHUB_LINK = "README.md"
export const HERO_DISCORD_LINK = "Join on Discord"

export const NEWS_TITLE = 
  "Last update! " + newsList.split("\n")[0];

export const NEWS_LIST =newsList

export const IMAGE_FEED_SUBTITLE =
  "Real-time feed of our image API endpoint"


export const IMAGE_FEED_TITLE = "Live Feed"
export const IMAGE_FEED_MODE1 = "Watch";
export const IMAGE_FEED_MODE2 = "Try";
export const IMAGE_EDIT_BUTTON_ON = "Imagine";
export const IMAGE_EDIT_BUTTON_OFF = "Imagine";
export const IMAGE_FEED_TOOLTIP_PROMPT = "describe the image to generate.";

export const IMAGE_FEED_TOOLTIP_MODEL = "Select the text-to-image model."
export const IMAGE_FEED_TOOLTIP_WIDTH = 
  "sets the number of pixels in the horizontal direction."

export const IMAGE_FEED_TOOLTIP_HEIGHT = 
  "sets the number of pixels in the vertical direction."

export const IMAGE_FEED_TOOLTIP_SEED =  
  "Explain that the seed is the starting value for randomness. Use the same seed to reproduce identical results."

export const IMAGE_FEED_ENANCER_TOOLTIP = 
  "Explain that this check box is to enable/disable the Pollinations AI prompt enhancer that can help creating better images by improving your text prompt."

export const IMAGE_FEED_LOGO_WATERMARK = 
  "Explain that this check box is to enable/disable the Pollinations watermark logo."

export const INTEGRATE_TITLE = "Integrate"
export const INTEGRATE_SUBTITLE =
  "Discover how to seamlessly integrate our free image and text generation API into your projects."

export const INTEGRATE_GITHUB_LINK = "APIDOCS.md"
export const PROJECT_TITLE = "Projects"
export const PROJECT_SUBTITLE = " Here are some of the various implementations that our API is currently powering."

export const PROJECT_CTO_1 = 
  "Ask if the user has created a project that integrates Pollinations.AI. Explain that would we be happy to feature it."

export const PROJECT_CTO_2 = "Reach out to us"

export const PROJECT_BUTTON = "Submit Your Project"
export const PROJECT_LOGO_STYLE =
  "square logo based on the info of the company. Only colored backgrounds. Be creative!"

export const COMMUNITY_TITLE = "Contribute";
export const COMMUNITY_SUBTITLE =
  "Introduce our community-driven approach. We're building a platform where developers, creators, and AI enthusiasts can collaborate and innovate."


export const COMMUNITY_DISCORD_SUBTITLE = 
  "Introduce our Discord channel, make it just a few words. In a single very short sentence."

export const COMMUNITY_DISCORD_CTO = "Discord"
export const COMMUNITY_GITHUB_SUBTITLE = 
  "Highlight our GitHub repository as a hub for collaboration and contribution. In a single very short sentence."

export const COMMUNITY_GITHUB_CTO = "GitHub"

export const ASCII_APP_TOOLTIP =
  "Incite the users to try out our ASCII art generator!"


export const TEAM_TITLE = "Our Team"

// Helper for team name formatting
const formatTeamName = (name) =>
  combine(rephrase)(`Write only the text '${name}' in bold and all caps`)

export const TEAM_MEMBERS = [
  { name: "Thomas Haferlach", function: "Lead visionary", image: team1 },
  { name: "Elliot Fouchy", function: "Lead Production", image: team2 },
  { name: "Laurent", function: "Developer", image: team3 },
  { name: "Nico", function: "Designer", image: team4 },
  { name: "Portrait XO", function: "Artist", image: team5 },
  { name: "Kalam", function: "Researcher", image: team6 },
];

export const SUPPORTER_TITLE = "Supporters";
export const SUPPORTER_SUBTITLE = `We're grateful to our supporters for their contributions to our platform.`;

export const SUPPORTER_LOGO_STYLE = "Company logo based on its description. The logo contrasts very much with the background. Colors and style of the company are used. The background is white but the logos are colorful and large. Be imaginative!";

export const FOOTER_TERMS_CONDITIONS_LINK = "Terms & Conditions";
export const FOOTER_TERMS_CONDITIONS = "Welcome to Pollinations.AI services empower harness AI technology creation interaction digital media. consent terms review attentively Acceptance Terms accessing Pollinations.AI confirm understanding agreement Terms Privacy Policy disagree advised not to use services offers AI - powered tools digital media retain ownership responsibility content encourage review licenses open - source models Content utilized commercial purposes legality ethical standards Pollinations.AI store user - content personal data stored user privacy information User Conduct Pollinations.AI ethically legally agree not Engage illegal activities violate local laws Infringe third - party rights intellectual property Disseminate malicious software data access probe services Prohibition of Unauthorized Materials services generate Celebrity Deepfakes Creating materials celebrities politicians public figures prohibited Child Sexual Abuse Material CSAM forbidden produce CSAM content under 18 years applies to fictional real - life subjects Intellectual Property content using Pollinations.AI crucial respect licenses open - source models content used for commercial purposes advise checking licenses for restrictions Pollinations.AI GmbH claims no intellectual property rights content Modification amend terms services after accept revised terms Governing Law subject to laws Germany conflict of laws principles Privacy Policy paramount outlines practices collection use protection sharing information Information collect details collect Discord IDs Usage Information anonymously track services experience without Cookies Tracking Technologies collect information deliver maintain refine services communication notices safeguard security integrity legal requirements. Sharing not for sale. share data with third parties service providers defend rights safety. safeguards protect against unauthorized access changes destruction Changes Privacy Policy update policy occasionally. changes communicated updating Privacy Policy Contact questions Privacy Policy hello@pollinations.ai";

export const FOOTER_CLOSE = "Close";
export const FOOTER_INFO = " 2025 Pollinations.AI - An open source AI startup based in Berlin"

export const ASCII_ART_PROMPT = (width, height) =>
  `Unicode/Ascii Art inspired by elegant, minimal Egyptian gods and mystical pyramids. ${width} width x ${height} height characters. Incorporate hieroglyphs and maintain a lot of empty space. Return only the characters, no other text or quotes.`
