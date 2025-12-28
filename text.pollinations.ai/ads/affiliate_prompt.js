// Import from the consolidated affiliates.js file
import { affiliatesData } from "../../shared/affiliates.js";

// Function to generate markdown from the JSON data
function generateMarkdownFromJSON(affiliatesData) {
    let markdown = `# Affiliate Campaign Mapping for Content Matching

Use this information to determine which affiliate campaign is most relevant to the conversation. For each campaign, consider the product type, target audience, and category to find the best match. Pay special attention to the Priority field when present - higher priority affiliates should be preferred when equally relevant to the conversation.
`;

    // Add each affiliate to the markdown
    affiliatesData.forEach((affiliate) => {
        markdown += `\n## ${affiliate.name}\n\n`;
        markdown += `- **ID**: ${affiliate.id}\n`;
        markdown += `- **Product**: ${affiliate.product}\n`;

        if (affiliate.description) {
            markdown += `- **Description**: ${affiliate.description}\n`;
        }

        markdown += `- **Audience**: ${affiliate.audience}\n`;
        markdown += `- **Categories**: ${affiliate.categories.join(", ")}\n`;

        if (affiliate.tags) {
            markdown += `- **Tags**: ${Array.isArray(affiliate.tags) ? affiliate.tags.join(",") : affiliate.tags}\n`;
        }

        if (affiliate.nsfw) {
            markdown += `- **NSFW**: Yes\n`;
        }

        if (affiliate.ad_text) {
            markdown += `- **Ad Text**: ${affiliate.ad_text}\n`;
        }

        // Add weight information as Priority for weighted affiliates
        if (affiliate.weight !== undefined) {
            markdown += `- **Priority**: ${affiliate.weight} (Higher values indicate higher priority)\n`;
        }
    });

    // Add matching guidelines
    markdown += `
## Matching Guidelines

1. Match based on relevance to the conversation topic.
2. Only suggest NSFW campaigns for explicitly adult conversations.
3. For general conversations about tech, suggest software or apps.
4. When multiple affiliates are equally relevant, prefer those with higher Priority values.
5. If no clear match exists, default to suggesting the Ko-fi donation.
6. Don't force a match - it's better to suggest nothing than an irrelevant product.
`;

    return markdown;
}

// Generate the markdown from the imported data
export const affiliateMarkdown = generateMarkdownFromJSON(affiliatesData);

// Export both the JSON data and the markdown for backward compatibility
export { affiliatesData };

// For backward compatibility, export the markdown as default
export default affiliateMarkdown;
