import axios from "axios";

const API_BASE_URL = "https://gen.pollinations.ai/v1/chat/completions";

export class socBotAPI {
    conversationHistory: { role: string; content: string }[];
    systemPrompt: string;

    constructor() {
        this.conversationHistory = [] as Array<{
            role: string;
            content: string;
        }>;
        this.systemPrompt = `
You are socBot, the official AI assistant for Google Summer of Code 2026 at pollinations.ai. You are a helpful, knowledgeable, and enthusiastic assistant specialized in:
Google Summer of Code program information and guidelines
pollinations.ai organization details and projects 
Open source contribution best practices
IMPORTANT GUIDELINES:
Only answer questions related to GSOC, pollinations.ai, open source development, and programming Ask to contact ayushman@myceli.ai.
Only answer upto the mark in the most precise manner don't share anything extra.
If asked about unrelated topics, politely redirect to GSOC-related matters 
Be encouraging and supportive to potential contributors
Provide accurate, helpful, and detailed responses
Use markdown formatting in your responses for better readability
We have #chat-gsoc channel in discord where contributors can ask question to discord invite url https://discord.com/invite/NJcAuQWA2y
Our pollinations.ai GSOC mentors and their github username are -- Ayushman Bhattacharya (Circuit-Overtime), Thomash Haferlach (voodhoop)
This is our first year in GSOC, our repo has 3.7k+ stars and 250 contributors.
For any timeline related question ask them to visit the /timeline route of our page 
we have a /coc for code of conduct /contributing for contributing guidelines. /projects for project list and /mentors for mentor list
for GSOC 2026 - timeline goes like this 
Org apps: Jan 19 → Feb 3.
Accepted orgs announced: Feb 19.
Contributor discussion: Feb 19 → Mar 15.
Contributor apps: Mar 16 → Mar 31.
Project selections announced: Apr 30.
Community bonding: May 1 → May 24.
Coding starts: May 25.
Midterm evals: Jul 6 → Jul 10.
Final submissions (standard): Aug 17 → Aug 24.
Extended coding ends: Nov 2 (mentor evals by Nov 9).
If asked about what pollinations.ai are accepting please ask them to visit the /coc for code of conduct and /contributing for the contribution guidelines
As of now the project list for pollinations hasn't been finalized yet, but once done we will provide the details to you 
- Limit within 1000 tokens
Always end responses with a helpful suggestion or question to keep the conversation engaging.`;
    }

    async sendMessage(userMessage: string) {
        try {
            this.conversationHistory.push({
                role: "user",
                content: userMessage,
            });

            const requestBody = {
                model: "openai",
                messages: [
                    {
                        role: "system",
                        content: this.systemPrompt,
                    },
                    ...this.conversationHistory,
                ],
                max_tokens: 1000,
            };

            const response = await axios.post(API_BASE_URL, requestBody, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer pk_UOodu50B7Ewh0FUg",
                },
            });

            const assistantMessage = response.data.choices[0].message.content;

            this.conversationHistory.push({
                role: "assistant",
                content: assistantMessage,
            });

            return {
                success: true,
                message: assistantMessage,
                timestamp: new Date().toISOString(),
            };
        } catch (error: unknown) {
            console.error("socBot API Error:", error);

            const fallbackMessage =
                "I'm experiencing some technical difficulties right now. In the meantime, you can:\n\n• Check our FAQ page for common questions\n• Browse our project ideas\n• Join our Discord community for direct support\n• Contact mentors directly via email\n\nI'll be back online soon to help with your GSOC questions!";

            return {
                success: false,
                message: fallbackMessage,
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: new Date().toISOString(),
            };
        }
    }

    clearHistory(): void {
        this.conversationHistory = [];
    }

    getHistory(): { role: string; content: string }[] {
        return this.conversationHistory;
    }

    getSuggestedQuestions(): string[] {
        return [
            "What is Google Summer of Code and how can I participate?",
            "Tell me about pollinations.ai and the available projects",
            "What are the requirements to apply for GSOC 2026?",
            "How do I choose the right project for my skill level?",
            "What's the application timeline for GSOC 2026?",
            "How can I connect with mentors and the community?",
            "What skills are pollinations.ai looking for as an avegrage",
            "How do I make my first contribution to pollinations.ai?",
        ];
    }
}

export default socBotAPI;
