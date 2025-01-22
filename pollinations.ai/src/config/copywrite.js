// Style prompts
export const REPHRASE =
  "Start by rewritring the prompt with a direct, professional tone, avoiding excess friendliness or humor. Preserve clarity and conciseness without undue formality."
export const EMOJI =
  "Enrich with suitable emojis and varied text styles (use bold and italics). Do not rephrase or change the text length."
export const TRANSLATE =
  "Translate the final text output into the user's language. Only output the translated text, nothing else. User language is:"
export const RESPONSIVE =
  "Most important, condense the final text to 5 words maximum. It needs to be super short for mobile friendliness. Don't exceed 5 words!"

// Copy prompts
export const HERO_INTRO =
  RESPONSIVE +
  REPHRASE +
  TRANSLATE +
  EMOJI +
  "Text to edit: Shortly introduce our open-source platform that provides easy-to-use text and image generation APIs. It requires no sign-ups or API keys, prioritizing user privacy and anonymity."

export const HERO_CTO =
  REPHRASE +
  TRANSLATE +
  EMOJI +
  "Express this in one very very short sentence: Talk to us, reach out. "
export const HERO_EMAIL_BUTTON = "hello@pollinations.ai"
export const HERO_GITHUB_LINK = "Readme.md"
export const HERO_DISCORD_LINK = "Join our Discord"

export const NEWS_TITLE = TRANSLATE + "Goal is to make a short title of the last updates section, In one very short sentence" + EMOJI
export const NEWS_LIST = REPHRASE + TRANSLATE + RESPONSIVE + `Flesh out news list in attractive friendly markdown. Make sure that this has a nice markdown format, using bold, italic, and many related emojis, but only small font size. Here is the list to fornat:
- **2023-10-01 - Feature Request**: Want a new feature? Create a [GitHub issue](https://github.com/pollinations/pollinations/issues/new) and our [AI assistant](https://mentat.ai/) will implement it!
- **2023-09-15 - New Release**: Check out our latest update with enhanced features and improved performance. [Read more](https://pollinations.ai/releases/2023-09-15)
- **2023-08-30 - Community Event**: Join our upcoming community event to connect with fellow developers and enthusiasts. [Register here](https://pollinations.ai/events/community-2023)
`

export const IMAGE_FEED_SUBTITLE =
REPHRASE +
TRANSLATE +
EMOJI +
"Express this in one sentence: This shows the real-time feed of our image API endpoint (minus the private ones). Try it now pausing the feed anytime."

export const IMAGE_FEED_TITLE = TRANSLATE + "Just the word 'Live Feed', meaning a stream of images"
export const IMAGE_FEED_MODE1 = TRANSLATE + "Just the word 'Watch', meaning looking at a live feed"
export const IMAGE_FEED_MODE2 = TRANSLATE + "Just the word 'Try', meaning trying to generate an image"
export const IMAGE_EDIT_BUTTON_ON = TRANSLATE + "Just the word 'Wait', meaning waiting for the image to be generated"
export const IMAGE_EDIT_BUTTON_OFF = TRANSLATE + "Just the word 'Create', meaning creating an image"

export const INTEGRATION_TITLE = TRANSLATE + "Integrate"
export const INTEGRATION_SUBTITLE = REPHRASE + TRANSLATE + EMOJI + "Express this in one sentence: Discover how to seamlessly integrate our free image and text generation API into your projects. Below are code examples to help you get started."
export const FEED_ENANCER_TOOLTIP =
  "AI prompt enhancer that helps create better images by improving your text prompt."
export const FEED_LOGO_WATERMARK = "Enable watermark logo."

export const PROJECT_TITLE = TRANSLATE + "Just the word: User Builds"
export const PROJECT_SUBTITLE = REPHRASE + TRANSLATE + EMOJI + "Express this in one sentence: Here are some of the various implementations that our API is currently powering."
export const PROJECT_DESCRIPTION_STYLE =
REPHRASE +
TRANSLATE +
EMOJI +
  "Text to edit: Underline texts that seem to be a link apart from if the text is 'pollinations.ai', because we already are on this website. Two sentnces maximum. Never link the Pollinations.ai website." 
  
export const PROJECT_CTO_1 = REPHRASE + TRANSLATE + EMOJI + "Question if they have created a project that integrates Pollinations.AI? Say that we'd love to feature it!"
export const PROJECT_CTO_2 = REPHRASE + TRANSLATE + EMOJI + "Express this in one very very short sentence: Talk to us"
export const PROJECT_BUTTON = "hello@pollinations.ai"
export const PROJECT_LOGO_STYLE =
  "minimalist colour logo design focuses on symbols and visuals, no text, solid off white background"

export const COMMUNITY_TITLE = TRANSLATE + "Contribute"
export const COMMUNITY_SUBTITLE =
  "Introduce our community-driven approach: Warning! We're building a platform where developers, creators, and AI enthusiasts can collaborate and innovate." +
  EMOJI

export const COMMUNITY_DISCORD_SUBTITLE = REPHRASE + TRANSLATE + EMOJI + "Introduce our Discord channel, make it just a few words. In a single very short sentence."
export const COMMUNITY_DISCORD_CTO = "Discord"
export const COMMUNITY_GITHUB_SUBTITLE = REPHRASE + TRANSLATE + EMOJI + "Highlight our GitHub repository as a hub for collaboration and contribution. In a single very short sentence."
export const COMMUNITY_GITHUB_CTO = "GitHub"

export const ASCII_APP_TOOLTIP = REPHRASE + TRANSLATE + EMOJI + "Incite the users to try out our ASCII art generator!"

export const TEAM_JOB_TITLE_STYLE = "Describe it with one very short poetic sentence, Format with related emojis."

export const TEAM_TITLE = TRANSLATE + "Just the word: Team"
export const TEAM_SUBTITLE = REPHRASE + TRANSLATE + EMOJI + "Introducing our team, explain that we are a collective of dedicated developers, creators, and AI enthusiasts collaborating to innovate and build exceptional solutions."
export const TEAM_1_NAME = REPHRASE + "Write only the text 'Thomas Haferlach' in bold and all caps"
export const TEAM_1_FUNCTION = REPHRASE + TRANSLATE + RESPONSIVE + EMOJI + "Lead visionary" + TEAM_JOB_TITLE_STYLE
export const TEAM_2_NAME = REPHRASE + "Write only the text 'Elliot Fouchy' in bold and all caps"
export const TEAM_2_FUNCTION = REPHRASE + TRANSLATE + RESPONSIVE + EMOJI + "Lead Production" + TEAM_JOB_TITLE_STYLE
export const TEAM_3_NAME = REPHRASE + "Write only the text 'Laurent Pacoud' in bold and all caps"
export const TEAM_3_FUNCTION = REPHRASE + TRANSLATE + EMOJI + "Lead Business" + TEAM_JOB_TITLE_STYLE
export const TEAM_4_NAME = REPHRASE + "Write only the text 'Nicolas Pellerin' in bold and all caps"
export const TEAM_4_FUNCTION = REPHRASE + TRANSLATE + RESPONSIVE + EMOJI + "Lead Coder" + TEAM_JOB_TITLE_STYLE
export const TEAM_5_NAME = REPHRASE + "Write only the text 'Portrait XO' in bold and all caps"
export const TEAM_5_FUNCTION = REPHRASE + TRANSLATE + RESPONSIVE + EMOJI + "Futuristic" + TEAM_JOB_TITLE_STYLE
export const TEAM_6_NAME = REPHRASE + "Write only the text 'Kalam Ali' in bold and all caps"
export const TEAM_6_FUNCTION = REPHRASE + TRANSLATE + RESPONSIVE + EMOJI + "Lead strategy" + TEAM_JOB_TITLE_STYLE

import team1 from "../assets/team/Thomas.webp"
import team2 from "../assets/team/Elliot.webp"
import team3 from "../assets/team/Laurent.jpeg"
import team4 from "../assets/team/Nico.jpeg"
import team5 from "../assets/team/Portrait_XO.webp"
import team6 from "../assets/team/Kalam.webp"

export const TEAM_1_IMAGE = team1
export const TEAM_2_IMAGE = team2
export const TEAM_3_IMAGE = team3
export const TEAM_4_IMAGE = team4
export const TEAM_5_IMAGE = team5
export const TEAM_6_IMAGE = team6

export const SUPPORTER_TITLE = TRANSLATE + "Just the word: Supporters"
export const SUPPORTER_SUBTITLE = REPHRASE + TRANSLATE + EMOJI + "Express this in one sentence: We're grateful to our supporters for their contributions to our platform."
export const SUPPORTER_LOGO_STYLE = "minimalist and modern square logo on white background" + EMOJI
export const SUPPORTER_DESCRIPTION_STYLE = REPHRASE + TRANSLATE + EMOJI + "Keep it very short, a few words"

export const FOOTER_TERMS_CONDITIONS =
TRANSLATE + 
  "Flesh out terms conditions Pollinations.AI in attractive friendly markdown. Make sure that this has a nice markdown format, using bold, italic, and different font size (like heading, title, h2...). Here is the text to work with: Welcome to Pollinations.AI services empower harness AI technology creation interaction digital media. consent terms review attentively Acceptance Terms accessing Pollinations.AI confirm understanding agreement Terms Privacy Policy disagree advised not to use services offers AI - powered tools digital media retain ownership responsibility content encourage review licenses open - source models Content utilized commercial purposes legality ethical standards Pollinations.AI store user - content personal data stored user privacy information User Conduct Pollinations.AI ethically legally agree not Engage illegal activities violate local laws Infringe third - party rights intellectual property Disseminate malicious software data access probe services Prohibition of Unauthorized Materials services generate Celebrity Deepfakes Creating materials celebrities politicians public figures prohibited Child Sexual Abuse Material CSAM forbidden produce CSAM content under 18 years applies to fictional real - life subjects Intellectual Property content using Pollinations.AI crucial respect licenses open - source models content used for commercial purposes advise checking licenses for restrictions Pollinations.AI GmbH claims no intellectual property rights content Modification amend terms services after accept revised terms Governing Law subject to laws Germany conflict of laws principles Privacy Policy paramount outlines practices collection use protection sharing information Information collect details collect Discord IDs Usage Information anonymously track services experience without Cookies Tracking Technologies collect information deliver maintain refine services communication notices safeguard security integrity legal requirements. Sharing not for sale. share data with third parties service providers defend rights safety. safeguards protect against unauthorized access changes destruction Changes Privacy Policy update policy occasionally. changes communicated updating Privacy Policy Contact questions Privacy Policy hello@pollinations.ai" +
  EMOJI
export const FOOTER_CLOSE = TRANSLATE + "Just the word: Close"
export const FOOTER_INFO = "© 2025 Pollinations.AI"

export const ASCII_ART_PROMPT = (width,height) => `Unicode/Ascii Art inspired by elegant, minimal Egyptian gods and mystical pyramids. ${width} width x ${height} height characters. Incorporate hieroglyphs and maintain a lot of empty space. Return only the characters, no other text or quotes.`