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

export const NEWS_TITLE =
  "Goal is to make a short title of the last updates section, In one very short sentence" + EMOJI
export const NEWS_LIST = `
- **2023-10-01 - Feature Request**: Want a new feature? Create a [GitHub issue](https://github.com/pollinations/pollinations/issues/new) and our [AI assistant](https://mentat.ai/) will implement it!
- **2023-09-15 - New Release**: Check out our latest update with enhanced features and improved performance. [Read more](https://pollinations.ai/releases/2023-09-15)
- **2023-08-30 - Community Event**: Join our upcoming community event to connect with fellow developers and enthusiasts. [Register here](https://pollinations.ai/events/community-2023)
`

export const IMAGE_FEED_SUBTITLE =
  "Express this in one sentence: This shows the real-time feed of our image API endpoint (minus the private ones). Try it now pausing the feed anytime." +
  EMOJI
export const IMAGE_FEED_TITLE = TRANSLATE + "Live Feed"
export const IMAGE_FEED_MODE1 = "DO NOT REPHRASE, Use only the text 'Watch'"
export const IMAGE_FEED_MODE2 = "DO NOT REPHRASE, write the text 'Try' only"
export const IMAGE_EDIT_BUTTON_ON = "Wait"
export const IMAGE_EDIT_BUTTON_OFF = "Create"

export const INTEGRATION_TITLE = TRANSLATE + "Integrate"
export const INTEGRATION_SUBTITLE =
  "Express this in one sentence: Discover how to seamlessly integrate our free image and text generation API into your projects. Below are code examples to help you get started." +
  EMOJI
export const FEED_ENANCER_TOOLTIP =
  "AI prompt enhancer that helps create better images by improving your text prompt."
export const FEED_LOGO_WATERMARK = "Enable watermark logo."

export const PROJECT_TITLE = TRANSLATE + "User Builds"
export const PROJECT_SUBTITLE =
  "Express this in one sentence: Here are some of the various implementations that our API is currently powering." +
  EMOJI
export const PROJECT_DESCRIPTION_STYLE =
REPHRASE +
TRANSLATE +
EMOJI +
  "Text to edit: Underline texts that seem to be a link apart from if the text is 'pollinations.ai', because we already are on this website. Two sentnces maximum. Never link the Pollinations.ai website." 
  
export const PROJECT_CTO_1 =
  "Question if they have created a project that integrates Pollinations.AI? Say that we'd love to feature it!" +
  EMOJI
export const PROJECT_CTO_2 = "Express this in one very very short sentence: Talk to us" + EMOJI
export const PROJECT_BUTTON = "hello@pollinations.ai"
export const PROJECT_LOGO_STYLE =
  "minimalist colour logo design focuses on symbols and visuals, no text, solid off white background"

export const COMMUNITY_TITLE = TRANSLATE + "Contribute"
export const COMMUNITY_SUBTITLE =
  "Introduce our community-driven approach: Warning! We're building a platform where developers, creators, and AI enthusiasts can collaborate and innovate." +
  EMOJI
export const COMMUNITY_DISCORD_LOGO_PROMPT = "Discord logo that looks cool"
export const COMMUNITY_GITHUB_LOGO_PROMPT = "GitHub logo that looks cool"
export const COMMUNITY_DISCORD_SUBTITLE =
  "Introduce our Discord channel, make it just a few words. Don't cite Discord. In a single very short sentence." +
  EMOJI
export const COMMUNITY_DISCORD_CTO = "Write only the text 'Join our Discord'"
export const COMMUNITY_GITHUB_SUBTITLE =
  "Highlight our GitHub repository as a hub for collaboration and contribution. Encourage participation in a single very short sentence. " +
  EMOJI
export const COMMUNITY_GITHUB_CTO = "Write only the text 'Visit our GitHub'"

export const ASCII_APP_TOOLTIP = "Try out our ASCII art generator!"

export const TEAM_JOB_TITLE_STYLE = "One short poetic sentence, Format with related emojis."

export const TEAM_TITLE = TRANSLATE + "Team"
export const TEAM_SUBTITLE =
  "Introducing our team, explain that we are a collective of dedicated developers, creators, and AI enthusiasts collaborating to innovate and build exceptional solutions." +
  EMOJI
export const TEAM_GITHUB_CTO = "Write only the text 'Visit our GitHub'" + EMOJI
export const TEAM_1_NAME = "Write only the text 'Thomas Haferlach' in bold and all caps"
export const TEAM_1_FUNCTION = "Write the text 'CEO'" + TEAM_JOB_TITLE_STYLE
export const TEAM_2_NAME = "Write only the text 'Elliot Fouchy' in bold and all caps"
export const TEAM_2_FUNCTION = "Write the text 'CTO'" + TEAM_JOB_TITLE_STYLE
export const TEAM_3_NAME = "Write only the text 'Laurent Pacoud' in bold and all caps"
export const TEAM_3_FUNCTION = "Write the text 'COO'Write" + TEAM_JOB_TITLE_STYLE
export const TEAM_4_NAME = "Write only the text 'Nicolas Pellerin' in bold and all caps"
export const TEAM_4_FUNCTION = "Write the text 'CMO'Write" + TEAM_JOB_TITLE_STYLE
export const TEAM_5_NAME = "Write only the text 'Portrait XO' in bold and all caps"
export const TEAM_5_FUNCTION = "Write the text 'CFO'Write" + TEAM_JOB_TITLE_STYLE
export const TEAM_6_NAME = "Write only the text 'Kalam Ali' in bold and all caps"
export const TEAM_6_FUNCTION = "Write the text 'CFO'Write" + TEAM_JOB_TITLE_STYLE

import team1 from "../assets/team/alex_johnson.png"
import team2 from "../assets/team/samantha_lee.png"
import team3 from "../assets/team/michael_chen.png"
import team4 from "../assets/team/jessica_gomez.png"
import team5 from "../assets/team/david_brown.png"
import team6 from "../assets/team/john_doe.png"

export const TEAM_1_IMAGE = team1
export const TEAM_2_IMAGE = team2
export const TEAM_3_IMAGE = team3
export const TEAM_4_IMAGE = team4
export const TEAM_5_IMAGE = team5
export const TEAM_6_IMAGE = team6

export const SUPPORTER_TITLE = "Support"
export const SUPPORTER_SUBTITLE =
  "We're grateful to our supporters for their contributions to our platform." + EMOJI
export const SUPPORTER_LOGO_STYLE = "minimalist and modern square logo on white background" + EMOJI
export const SUPPORTER_DESCRIPTION_STYLE = "Keep it very short, a few words" + EMOJI

export const FOOTER_TERMS_CONDITIONS =
  "Flesh out terms conditions Pollinations.AI in attractive friendly markdown. Terms Welcome to Pollinations.AI services empower harness AI technology creation interaction digital media. consent terms review attentively Acceptance Terms accessing Pollinations.AI confirm understanding agreement Terms Privacy Policy disagree advised not to use services offers AI - powered tools digital media retain ownership responsibility content encourage review licenses open - source models Content utilized commercial purposes legality ethical standards Pollinations.AI store user - content personal data stored user privacy information User Conduct Pollinations.AI ethically legally agree not Engage illegal activities violate local laws Infringe third - party rights intellectual property Disseminate malicious software data access probe services Prohibition of Unauthorized Materials services generate Celebrity Deepfakes Creating materials celebrities politicians public figures prohibited Child Sexual Abuse Material CSAM forbidden produce CSAM content under 18 years applies to fictional real - life subjects Intellectual Property content using Pollinations.AI crucial respect licenses open - source models content used for commercial purposes advise checking licenses for restrictions Pollinations.AI GmbH claims no intellectual property rights content Modification amend terms services after accept revised terms Governing Law subject to laws Germany conflict of laws principles Privacy Policy paramount outlines practices collection use protection sharing information Information collect details collect Discord IDs Usage Information anonymously track services experience without Cookies Tracking Technologies collect information deliver maintain refine services communication notices safeguard security integrity legal requirements. Sharing not for sale. share data with third parties service providers defend rights safety. safeguards protect against unauthorized access changes destruction Changes Privacy Policy update policy occasionally. changes communicated updating Privacy Policy Contact questions Privacy Policy hello@pollinations.ai" +
  EMOJI
export const FOOTER_INFO = "© 2025 Pollinations.AI All Rights Reserved"
