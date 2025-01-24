import { Colors } from "../config/global"

import { newsList } from "../config/newsList"

import team1 from "../assets/team/Thomas.webp"
import team2 from "../assets/team/Elliot.webp"
import team3 from "../assets/team/Laurent.jpeg"
import team4 from "../assets/team/Nico.jpeg"
import team5 from "../assets/team/Portrait_XO.webp"
import team6 from "../assets/team/Kalam.webp"

const userLanguage = navigator.language || navigator.userLanguage
const isEnglish = userLanguage.startsWith("en")

const responsive = (text) =>
`Condense the text to 5 words maximum. It needs to be super short for mobile friendliness. Don't exceed 5 words! Return only the condensed text.

# Text
\`${text}\``


const translate = (text) => 
`Translate the text into the user's language. Only output the translated text, nothing else. User 
  language is: ${userLanguage}. 

# Context:
${text}

Text to translate: \`${text}\`.`

const rephrase = (text) =>
`Formulate the idea with a direct, friendly but professional tone. Preserve clarity and conciseness without undue formality. Return only the reformatted text.

# Text
${text}`;

const emojify = (text) =>
`Enrich the text with suitable emojis and varied text styles (use bold and italics). Do not rephrase or change the text length. Return only the emojified text.

# Text
${text}`;

const transformations = {
  translate,
  responsive,
  rephrase,
  emojify
}

// Copy prompts
export const HERO_INTRO =
  REPHRASE +
  TRANSLATE +
  EMOJI +
  "Shortly introduce our open-source platform that provides easy-to-use text and image generation APIs. It requires no sign-ups or API keys, prioritizing user privacy and anonymity. 20 words maximum."

export const HERO_CTO =
  REPHRASE +
  TRANSLATE +
  EMOJI +
  "Express this in one very very short sentence: Talk to us, reach out. "
export const HERO_EMAIL_BUTTON = "hello@pollinations.ai"
export const HERO_GITHUB_LINK = "Readme.md"
export const HERO_DISCORD_LINK = "Join our Discord"

export const NEWS_TITLE =
  REPHRASE +
  TRANSLATE +
  EMOJI +
  "We want a short title for the 'last updates' section, in one very short sentence. Use bold font"
export const NEWS_LIST =
  REPHRASE +
  RESPONSIVE +
  TRANSLATE +
  EMOJI +
  `Flesh out news list in attractive friendly markdown. Make sure that this has a nice markdown format, using bold, italic, and many related emojis, but only small font size. Do not give a title to it, start with the first bullet point. Here is the list to fornat: ` +
  newsList

export const IMAGE_FEED_SUBTITLE =
  REPHRASE +
  TRANSLATE +
  EMOJI +
  "Express this in one sentence: This shows the real-time feed of our image API endpoint (minus the private ones). Try it now pausing the feed anytime."

export const IMAGE_FEED_TITLE = TRANSLATE + "Live Feed"
export const IMAGE_FEED_MODE1 = TRANSLATE + "Watch"
export const IMAGE_FEED_MODE2 = TRANSLATE + "Try"
export const IMAGE_EDIT_BUTTON_ON = TRANSLATE + "Imagine"
export const IMAGE_EDIT_BUTTON_OFF = TRANSLATE + "Imagine"

export const INTEGRATION_TITLE = TRANSLATE + "Integrate"
export const INTEGRATION_SUBTITLE =
  REPHRASE +
  TRANSLATE +
  EMOJI +
  "Express this in one sentence: Discover how to seamlessly integrate our free image and text generation API into your projects. Below are code examples to help you get started. Check our Github for detailed documentation."

export const IMAGE_FEED_TOOLTIP_PROMPT = REPHRASE + TRANSLATE + EMOJI + "This text box is for the text prompt describing the image you want to generate."
export const IMAGE_FEED_TOOLTIP_MODEL = REPHRASE + TRANSLATE + EMOJI + "Select the text-to-image model you would like to use."
export const IMAGE_FEED_TOOLTIP_WIDTH = REPHRASE + TRANSLATE + EMOJI + "This number sets the number of pixels in the horizontal direction."
export const IMAGE_FEED_TOOLTIP_HEIGHT = REPHRASE + TRANSLATE + EMOJI + "This number sets the number of pixels in the vertical direction."
export const IMAGE_FEED_TOOLTIP_SEED = REPHRASE + TRANSLATE + EMOJI + "Explain that the seed is the starting value for randomness. Use the same seed to reproduce identical results. Keep it informative but short"
export const FEED_ENANCER_TOOLTIP =
  REPHRASE +
  TRANSLATE +
  EMOJI +
  "Explain that this check box is to enable/disable the Pollinations AI prompt enhancer that can help creating better images by improving your text prompt."
export const FEED_LOGO_WATERMARK =
  REPHRASE +
  TRANSLATE +
  EMOJI +
  "Explain that this check box is to enable/disable the Pollinations watermark logo."

export const PROJECT_TITLE = TRANSLATE + "Projects"
export const PROJECT_SUBTITLE =
  REPHRASE +
  TRANSLATE +
  EMOJI +
  "Express this in one sentence: Here are some of the various implementations that our API is currently powering."
export const PROJECT_DESCRIPTION =
  REPHRASE +
  RESPONSIVE +
  TRANSLATE +
  EMOJI +
  "Convey the project description in one very short sentence. Technical language is fine. Be very synthetic. Never link the Pollinations.ai website, any other link in the description should be displayed as a clickable word"

export const PROJECT_CTO_1 =
  REPHRASE +
  RESPONSIVE +
  TRANSLATE +
  EMOJI +
  "Express this in one sentence: Do you have created a project that integrates Pollinations.AI? Say that we'd love to feature it! Be very synthetic."
export const PROJECT_CTO_2 =
  REPHRASE + TRANSLATE + EMOJI + "Express this in one very very short sentence: Talk to us"
export const PROJECT_BUTTON = "hello@pollinations.ai"
export const PROJECT_LOGO_STYLE =
  "minimalist colour logo design focuses on symbols and visuals, no text, solid off white background"

export const COMMUNITY_TITLE = TRANSLATE + "Contribute"
export const COMMUNITY_SUBTITLE =
  REPHRASE +
  TRANSLATE +
  EMOJI +
  "Introduce our community-driven approach: Warning! We're building a platform where developers, creators, and AI enthusiasts can collaborate and innovate."

export const COMMUNITY_DISCORD_SUBTITLE =
  REPHRASE +
  RESPONSIVE +
  TRANSLATE +
  EMOJI +
  "Introduce our Discord channel, make it just a few words. In a single very short sentence."
export const COMMUNITY_DISCORD_CTO = "Discord"
export const COMMUNITY_GITHUB_SUBTITLE =
  REPHRASE +
  RESPONSIVE +
  TRANSLATE +
  EMOJI +
  "Highlight our GitHub repository as a hub for collaboration and contribution. In a single very short sentence."
export const COMMUNITY_GITHUB_CTO = "GitHub"

export const ASCII_APP_TOOLTIP =
  REPHRASE + TRANSLATE + EMOJI + "Incite the users to try out our ASCII art generator!"

export const TEAM_TITLE = TRANSLATE + "Our Team"
export const TEAM_SUBTITLE =
  REPHRASE +
  RESPONSIVE +
  TRANSLATE +
  EMOJI +
  "Introducing our team, explain that we are a collective of dedicated developers, creators, and AI enthusiasts collaborating to innovate and build exceptional solutions. 20 words maximum."
export const TEAM_1_NAME = REPHRASE + "Write only the text 'Thomas Haferlach' in bold and all caps"
export const TEAM_1_FUNCTION =
  REPHRASE + TRANSLATE + RESPONSIVE + EMOJI + "Lead visionary" + teamTitleStyle
export const TEAM_2_NAME = REPHRASE + "Write only the text 'Elliot Fouchy' in bold and all caps"
export const TEAM_2_FUNCTION =
  REPHRASE + TRANSLATE + RESPONSIVE + EMOJI + "Lead Production" + teamTitleStyle
export const TEAM_3_NAME = REPHRASE + "Write only the text 'Laurent Pacoud' in bold and all caps"
export const TEAM_3_FUNCTION = REPHRASE + TRANSLATE + EMOJI + "Lead Business" + teamTitleStyle
export const TEAM_4_NAME = REPHRASE + "Write only the text 'Nicolas Pellerin' in bold and all caps"
export const TEAM_4_FUNCTION =
  REPHRASE + TRANSLATE + RESPONSIVE + EMOJI + "Lead Coder" + teamTitleStyle
export const TEAM_5_NAME = REPHRASE + "Write only the text 'Portrait XO' in bold and all caps"
export const TEAM_5_FUNCTION =
  REPHRASE + TRANSLATE + RESPONSIVE + EMOJI + "Futurist" + teamTitleStyle
export const TEAM_6_NAME = REPHRASE + "Write only the text 'Kalam Ali' in bold and all caps"
export const TEAM_6_FUNCTION =
  REPHRASE + TRANSLATE + RESPONSIVE + EMOJI + "Lead strategy" + teamTitleStyle

export const TEAM_1_IMAGE = team1
export const TEAM_2_IMAGE = team2
export const TEAM_3_IMAGE = team3
export const TEAM_4_IMAGE = team4
export const TEAM_5_IMAGE = team5
export const TEAM_6_IMAGE = team6

export const SUPPORTER_TITLE = TRANSLATE + "Supporters"
export const SUPPORTER_SUBTITLE =
  REPHRASE +
  TRANSLATE +
  EMOJI +
  "Express this in one sentence: We're grateful to our supporters for their contributions to our platform."
export const SUPPORTER_LOGO_STYLE = "minimalist and modern square logo on white background" + EMOJI
export const SUPPORTER_DESCRIPTION_STYLE =
  REPHRASE +
  EMOJI +
  TRANSLATE +
  "Convey the description of the supporter buisness very very briefly, 5 words maximum."

export const FOOTER_TERMS_CONDITIONS_LINK = TRANSLATE + "Terms & Conditions"
export const FOOTER_TERMS_CONDITIONS =
  TRANSLATE +
  EMOJI +
  "Flesh out terms conditions Pollinations.AI in attractive friendly markdown. Make sure that this has a nice markdown format, using bold, italic, and different font size (like heading, title, h2...). Here is the text to work with: Welcome to Pollinations.AI services empower harness AI technology creation interaction digital media. consent terms review attentively Acceptance Terms accessing Pollinations.AI confirm understanding agreement Terms Privacy Policy disagree advised not to use services offers AI - powered tools digital media retain ownership responsibility content encourage review licenses open - source models Content utilized commercial purposes legality ethical standards Pollinations.AI store user - content personal data stored user privacy information User Conduct Pollinations.AI ethically legally agree not Engage illegal activities violate local laws Infringe third - party rights intellectual property Disseminate malicious software data access probe services Prohibition of Unauthorized Materials services generate Celebrity Deepfakes Creating materials celebrities politicians public figures prohibited Child Sexual Abuse Material CSAM forbidden produce CSAM content under 18 years applies to fictional real - life subjects Intellectual Property content using Pollinations.AI crucial respect licenses open - source models content used for commercial purposes advise checking licenses for restrictions Pollinations.AI GmbH claims no intellectual property rights content Modification amend terms services after accept revised terms Governing Law subject to laws Germany conflict of laws principles Privacy Policy paramount outlines practices collection use protection sharing information Information collect details collect Discord IDs Usage Information anonymously track services experience without Cookies Tracking Technologies collect information deliver maintain refine services communication notices safeguard security integrity legal requirements. Sharing not for sale. share data with third parties service providers defend rights safety. safeguards protect against unauthorized access changes destruction Changes Privacy Policy update policy occasionally. changes communicated updating Privacy Policy Contact questions Privacy Policy hello@pollinations.ai"
export const FOOTER_CLOSE = TRANSLATE + "Close"
export const FOOTER_INFO = "© 2025 Pollinations.AI"

export const ASCII_ART_PROMPT = (width, height) =>
  `Unicode/Ascii Art inspired by elegant, minimal Egyptian gods and mystical pyramids. ${width} width x ${height} height characters. Incorporate hieroglyphs and maintain a lot of empty space. Return only the characters, no other text or quotes.`
