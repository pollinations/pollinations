import { Colors } from "../config/global"

import { newsList } from "../config/newsList"

import team1 from "../assets/team/Thomas.webp"
import team2 from "../assets/team/Elliot.webp"
import team3 from "../assets/team/Laurent.jpeg"
import team4 from "../assets/team/Nico.jpeg"
import team5 from "../assets/team/Portrait_XO.webp"
import team6 from "../assets/team/Kalam.webp"


const context = () => `The text appears on the website Pollinations.AI. Pollinations.AI is a generative AI service that allows creating different types of media using AI models.`;

const responsive = ({ isXs }) => isXs ?? false ?
`Condense the text to 5 words maximum. It needs to be super short for mobile friendliness. Don't exceed 5 words!` : null;

const translate = ({ userLanguage }) => userLanguage?.startsWith("en") ? null :
`Translate the text into the user's language. Only output the translated text, nothing else. User 
  language is: ${userLanguage}. 
`

const rephrase = () => `Formulate the idea with a direct, friendly but professional tone. Preserve clarity and conciseness without undue formality.`;

const emojify = () =>
`Enrich the text with suitable emojis and varied text styles (use bold and italics). Do not rephrase or change the text length.`;

const teamStyle = () =>
`Describe it with one very very short poetic sentence, 6 words maximum. Make it professional and impactful.`;

const supporterStyle = () => `Convey very very briefly, 5 words maximum.`
 
const combine = (text, ...transformations) => props => `
# Context
${context()}

# Instructions:
Apply the following transformations to the text in order:

${transformations.filter(Boolean).map((t) => `- ${t(props)}`).join("\n")}

Only output the final text, nothing else.

# Text:
${text}
` 



const projectDescription = () => `Convey in one very short sentence. Technical language is fine. Be very synthetic. Never link the Pollinations.ai website, any other link in the description should be displayed as a clickable word`;


// Helper functions for common transformation combinations
const translateOnly = text => props => combine(text, translate)(props);
const translateAndEmojify = text => props => combine(text, translate, emojify)(props);
const basicTransform = text => props => combine(text, translate, rephrase, emojify)(props);
const responsiveTransform = text => props => combine(text, translate, rephrase, responsive, emojify)(props);
const teamTitleTransform = text => props => combine(text, teamStyle, translate)(props);
const projectTransform = text => props => combine(text, projectDescription)(props);

export const HERO_INTRO = basicTransform("Concisely introduce our open-source platform that provides easy-to-use text and image generation APIs. It requires no sign-ups or API keys, prioritizing user privacy and anonymity. 20 words maximum.");

export const HERO_CTO = basicTransform("Express this in one very very short sentence: Talk to us, reach out. ");

export const HERO_EMAIL_BUTTON = "hello@pollinations.ai"
export const HERO_GITHUB_LINK = "APIDOCS.md"
export const HERO_DISCORD_LINK = "Join our Discord"

export const NEWS_TITLE = basicTransform("We want a short title in one very short sentence. Use bold font");
export const NEWS_LIST = responsiveTransform(`Flesh out in attractive friendly markdown using bold, italic, and many related emojis, Only regular font size. Do not give a title to it, start with the first bullet point. Here is the list to format: ` + newsList);

export const IMAGE_FEED_SUBTITLE = basicTransform("Express this in one sentence: This shows the real-time feed of our image API endpoint (minus the private ones). Try it now pausing the feed anytime.");
export const IMAGE_FEED_TITLE = translateOnly("Live Feed");
export const IMAGE_FEED_MODE1 = translateOnly("Watch");
export const IMAGE_FEED_MODE2 = translateOnly("Try");
export const IMAGE_EDIT_BUTTON_ON = translateOnly("Imagine");
export const IMAGE_EDIT_BUTTON_OFF = translateOnly("Imagine");

export const INTEGRATION_TITLE = translateOnly("Integrate");
export const INTEGRATION_SUBTITLE = basicTransform("Express this in one sentence: Discover how to seamlessly integrate our free image and text generation API into your projects. Below are code examples to help you get started. Check our Github for detailed documentation.");

export const IMAGE_FEED_TOOLTIP_PROMPT = basicTransform("This text box is for the text prompt describing the image you want to generate.");
export const IMAGE_FEED_TOOLTIP_MODEL = basicTransform("Select the text-to-image model you would like to use.");
export const IMAGE_FEED_TOOLTIP_WIDTH = basicTransform("This number sets the number of pixels in the horizontal direction.");
export const IMAGE_FEED_TOOLTIP_HEIGHT = basicTransform("This number sets the number of pixels in the vertical direction.");
export const IMAGE_FEED_TOOLTIP_SEED = basicTransform("Explain that the seed is the starting value for randomness. Use the same seed to reproduce identical results. Keep it informative but short");
export const FEED_ENANCER_TOOLTIP = basicTransform("Explain that this check box is to enable/disable the Pollinations AI prompt enhancer that can help creating better images by improving your text prompt.");
export const FEED_LOGO_WATERMARK = basicTransform("Explain that this check box is to enable/disable the Pollinations watermark logo.");

export const PROJECT_TITLE = translateOnly("Projects");
export const PROJECT_SUBTITLE = basicTransform("Express this in one sentence: Here are some of the various implementations that our API is currently powering.");

export const PROJECT_DESCRIPTION = projectDescription => combine(projectDescription, projectTransform);

export const PROJECT_CTO_1 = responsiveTransform("Express this in one sentence: Do you have created a project that integrates Pollinations.AI? Say that we'd love to feature it! Be very synthetic.");
export const PROJECT_CTO_2 = basicTransform("Express this in one very very short sentence: Talk to us");
export const PROJECT_BUTTON = "hello@pollinations.ai"
export const PROJECT_LOGO_STYLE =
  "square logo based on the info of the company. Only colored backgrounds. Be creative!"

export const COMMUNITY_TITLE = translateOnly("Contribute");
export const COMMUNITY_SUBTITLE = basicTransform("Introduce our community-driven approach: Warning! We're building a platform where developers, creators, and AI enthusiasts can collaborate and innovate.");

export const COMMUNITY_DISCORD_SUBTITLE = responsiveTransform("Introduce our Discord channel, make it just a few words. In a single very short sentence.");
export const COMMUNITY_DISCORD_CTO = "Discord"
export const COMMUNITY_GITHUB_SUBTITLE = responsiveTransform("Highlight our GitHub repository as a hub for collaboration and contribution. In a single very short sentence.");
export const COMMUNITY_GITHUB_CTO = "GitHub"

export const ASCII_APP_TOOLTIP = basicTransform("Incite the users to try out our ASCII art generator!");

export const TEAM_TITLE = translateOnly("Our Team");
export const TEAM_SUBTITLE = responsiveTransform("Introducing our team, explain that we are a collective of dedicated developers, creators, and AI enthusiasts collaborating to innovate and build exceptional solutions. 20 words maximum.");

// Helper for team name formatting
const formatTeamName = name => combine(rephrase)(`Write only the text '${name}' in bold and all caps`);

export const TEAM_1_NAME = formatTeamName("Thomas Haferlach");
export const TEAM_1_FUNCTION = teamTitleTransform("Lead visionary");
export const TEAM_2_NAME = formatTeamName("Elliot Fouchy");
export const TEAM_2_FUNCTION = teamTitleTransform("Lead Production");
export const TEAM_3_NAME = formatTeamName("Laurent Pacoud");
export const TEAM_3_FUNCTION = teamTitleTransform("Lead Business");
export const TEAM_4_NAME = formatTeamName("Nicolas Pellerin");
export const TEAM_4_FUNCTION = teamTitleTransform("Lead Developer");
export const TEAM_5_NAME = formatTeamName("Portrait XO");
export const TEAM_5_FUNCTION = teamTitleTransform("Lead Artist");
export const TEAM_6_NAME = formatTeamName("Kalam Ali");
export const TEAM_6_FUNCTION = teamTitleTransform("Lead Researcher");

export const TEAM_1_IMAGE = team1
export const TEAM_2_IMAGE = team2
export const TEAM_3_IMAGE = team3
export const TEAM_4_IMAGE = team4
export const TEAM_5_IMAGE = team5
export const TEAM_6_IMAGE = team6

export const SUPPORTER_TITLE = translateOnly("Supporters");
export const SUPPORTER_SUBTITLE = basicTransform("Express this in one sentence: We're grateful to our supporters for their contributions to our platform.");
export const SUPPORTER_LOGO_STYLE = "square logo based on the info of the company. Be creative!";
export const SUPPORTER_DESCRIPTION_STYLE = description => combine(description, translateOnly);


export const FOOTER_TERMS_CONDITIONS_LINK = translateOnly("Terms & Conditions");
export const FOOTER_TERMS_CONDITIONS = translateAndEmojify("Flesh out terms conditions Pollinations.AI in attractive friendly markdown. Make sure that this has a nice markdown format, using bold, italic, and different font size (like heading, title, h2...). Here is the text to work with: Welcome to Pollinations.AI services empower harness AI technology creation interaction digital media. consent terms review attentively Acceptance Terms accessing Pollinations.AI confirm understanding agreement Terms Privacy Policy disagree advised not to use services offers AI - powered tools digital media retain ownership responsibility content encourage review licenses open - source models Content utilized commercial purposes legality ethical standards Pollinations.AI store user - content personal data stored user privacy information User Conduct Pollinations.AI ethically legally agree not Engage illegal activities violate local laws Infringe third - party rights intellectual property Disseminate malicious software data access probe services Prohibition of Unauthorized Materials services generate Celebrity Deepfakes Creating materials celebrities politicians public figures prohibited Child Sexual Abuse Material CSAM forbidden produce CSAM content under 18 years applies to fictional real - life subjects Intellectual Property content using Pollinations.AI crucial respect licenses open - source models content used for commercial purposes advise checking licenses for restrictions Pollinations.AI GmbH claims no intellectual property rights content Modification amend terms services after accept revised terms Governing Law subject to laws Germany conflict of laws principles Privacy Policy paramount outlines practices collection use protection sharing information Information collect details collect Discord IDs Usage Information anonymously track services experience without Cookies Tracking Technologies collect information deliver maintain refine services communication notices safeguard security integrity legal requirements. Sharing not for sale. share data with third parties service providers defend rights safety. safeguards protect against unauthorized access changes destruction Changes Privacy Policy update policy occasionally. changes communicated updating Privacy Policy Contact questions Privacy Policy hello@pollinations.ai");

export const FOOTER_CLOSE = translateOnly("Close");
export const FOOTER_INFO = " 2025 Pollinations.AI"

export const ASCII_ART_PROMPT = (width, height) =>
  `Unicode/Ascii Art inspired by elegant, minimal Egyptian gods and mystical pyramids. ${width} width x ${height} height characters. Incorporate hieroglyphs and maintain a lot of empty space. Return only the characters, no other text or quotes.`
