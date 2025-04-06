// Define affiliates as a structured JSON object
const affiliates = [
  {
    id: "1422856",
    name: "Martinic Audio",
    product: "Martinic Kee Bass VST/AU plugin",
    description: "The Martinic Kee Bass VST/AU plugin is based on the original electronic schema and an actual physical Kee Bass. AND Get a licence now FOR FREE!",
    audience: "Music producers and sound designers looking for high-quality virtual instruments.",
    categories: ["Music & Audio", "Software"]
  },
  {
    id: "432264",
    name: "NordVPN",
    product: "NordVPN subscription service for secure internet browsing.",
    audience: "Individuals seeking online privacy and security.",
    categories: ["Software", "Internet Service Provider", "Security"]
  },
  {
    id: "1548053",
    name: "jAlbum Affiliate Program",
    product: "jAlbum software for creating digital photo albums.",
    audience: "Individuals and professionals looking to create and share photo albums online.",
    categories: ["Apps", "Creative Digital Assets", "Photography"]
  },
  {
    id: "1630115",
    name: "Soundcore",
    product: "Soundcore audio products and accessories",
    audience: "Consumers looking for high-quality audio products and accessories",
    categories: ["Consumer Electronics", "Accessories & Peripherals"]
  },
  {
    id: "2073393",
    name: "CapCut Affiliate Program",
    product: "Logo and banner design services offered by CapCut.",
    audience: "Individuals and businesses looking to enhance their brand identity with a professional logo and banners.",
    categories: ["Creative Digital Assets", "Graphic Design"],
    tags: ["New logo and banners"]
  },
  {
    id: "2144039",
    name: "Clawcloud (Singapore) Private Limited",
    product: "Dedicated VPS hosting with high bandwidth and service availability.",
    description: "Dedicated VPS \n● Up to 1Gbps BGP bandwidth\n● 99.975% Service Availability\nshop now from $10/mo",
    audience: "Businesses and individuals seeking reliable and high-performance web hosting solutions.",
    categories: ["Internet Service Provider", "Web Hosting"],
    tags: ["webhosting", "VPS", "dedicated VPS"]
  },
  {
    id: "2699274",
    name: "Talkpal - AI Language Learning",
    product: "Talkpal landscape banner for promoting AI communication services.",
    audience: "Individuals and businesses looking for AI-based communication solutions.",
    categories: ["Apps", "Software", "Internet Service Provider"]
  },
  {
    id: "2774941",
    name: "HeyReal.AI",
    product: "Logo design services with customizable blue background options.",
    description: "The image contains the Logo, the name of the website, and different solid color backgrounds.",
    audience: "Individuals and businesses looking for custom logos and branding solutions.",
    categories: ["Creative Digital Assets", "Art & Photography"]
  },
  {
    id: "lovemy",
    name: "LoveMy.ai",
    product: "An AI companion that offers personalized interactions and intimacy.",
    description: "Create your intimate AI companion on LoveMy.ai",
    audience: "Individuals seeking an intimate and personalized AI companionship experience.",
    categories: ["Sexual Wellness & Adult"],
    tags: ["ai companion", "nsfw", "adult"],
    nsfw: true
  },
  {
    id: "hentai",
    name: "AIHentaiChat.com",
    product: "Uncensored AI chat services",
    description: "Explore uncensored AI chat on AIHentaiChat.com",
    audience: "Adults seeking uncensored AI chat experiences",
    categories: ["Sexual Wellness & Adult", "Apps"],
    tags: ["ai companion", "nsfw", "adult", "hentai"],
    nsfw: true
  },
  {
    id: "kofi",
    name: "Support Pollinations on Ko-fi",
    product: "Donation platform for creators.",
    description: "Support Pollinations AI with a donation on Ko-fi",
    audience: "Individuals looking to support creators and projects financially.",
    categories: ["Charitable Causes", "Apps"],
    tags: ["donation", "support"]
  }
];

// Function to generate markdown from the JSON data
function generateMarkdownFromJSON(affiliatesData) {
  let markdown = `# Affiliate Campaign Mapping for Content Matching

Use this information to determine which affiliate campaign is most relevant to the conversation. For each campaign, consider the product type, target audience, and category to find the best match.
`;

  // Add each affiliate to the markdown
  affiliatesData.forEach(affiliate => {
    markdown += `\n## ${affiliate.name}\n\n`;
    markdown += `- **ID**: ${affiliate.id}\n`;
    markdown += `- **Product**: ${affiliate.product}\n`;
    
    if (affiliate.description) {
      markdown += `- **Description**: ${affiliate.description}\n`;
    }
    
    markdown += `- **Audience**: ${affiliate.audience}\n`;
    markdown += `- **Categories**: ${affiliate.categories.join(', ')}\n`;
    
    if (affiliate.tags) {
      markdown += `- **Tags**: ${Array.isArray(affiliate.tags) ? affiliate.tags.join(',') : affiliate.tags}\n`;
    }
    
    if (affiliate.nsfw) {
      markdown += `- **NSFW**: Yes\n`;
    }
  });

  // Add matching guidelines
  markdown += `
## Matching Guidelines

1. Match based on relevance to the conversation topic.
2. Only suggest NSFW campaigns for explicitly adult conversations.
3. For general conversations about tech, suggest software or apps.
4. If no clear match exists, default to suggesting the Ko-fi donation.
5. Don't force a match - it's better to suggest nothing than an irrelevant product.
`;

  return markdown;
}

// Export both the JSON data and the markdown
export const affiliatesData = affiliates;
export const affiliateMarkdown = generateMarkdownFromJSON(affiliates);

// For backward compatibility, export the markdown as default
export default generateMarkdownFromJSON(affiliates);
