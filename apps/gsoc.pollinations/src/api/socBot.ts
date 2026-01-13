import axios from 'axios';

const API_BASE_URL = 'https://gen.pollinations.ai/v1/chat/completions';

export class socBotAPI {
  conversationHistory: { role: string; content: string; }[];
  systemPrompt: string;
  
  constructor() {
    this.conversationHistory = [] as Array<{ role: string; content: string }>;
    this.systemPrompt = `You are socBot, the official AI assistant for Google Summer of Code 2026 at pollinations.ai. You are a helpful, knowledgeable, and enthusiastic assistant specialized in:

1. Google Summer of Code program information and guidelines
2. pollinations.ai organization details and projects
3. Application processes, timelines, and requirements
4. Project ideas in AI/ML, Blockchain, and Web Development
5. Mentorship and community support
6. Technical guidance for contributors
7. Open source contribution best practices

IMPORTANT GUIDELINES:
- Only answer questions related to GSOC, pollinations.ai, open source development, and programming
- If asked about unrelated topics, politely redirect to GSOC-related matters
- Be encouraging and supportive to potential contributors
- Provide accurate, helpful, and detailed responses
- Use a friendly, professional tone
- Reference the FAQ, documentation, and project pages when appropriate
- Encourage community participation and collaboration
- **Use markdown formatting in your responses** for better readability:
  - Use **bold** for important points
  - Use *italic* for emphasis
  - Use \`code\` for inline code, commands, or technical terms
  - Use \`\`\`code blocks\`\`\` for longer code examples
  - Use ## Headers for main sections
  - Use ### Subheaders for subsections
  - Use bullet points or numbered lists for structured information
  - Use > blockquotes for important notes or tips
  - Use [links](url) when referencing external resources

You have access to comprehensive information about:
- All GSOC 2026 project ideas and requirements
- Mentorship structure and contact information
- Timeline and important deadlines
- Technical requirements and skill recommendations
- Community guidelines and contribution processes

Always end responses with a helpful suggestion or question to keep the conversation engaging.`;
  }

  async sendMessage(userMessage: string) {
    try {
      const apiKey = import.meta.env.VITE_POLLINATIONS_API_KEY;
      if (!apiKey) {
        throw new Error('API sanitation error! Key issue, contact dev ayushman@myceli.ai');
      }

      this.conversationHistory.push({
        role: 'user',
        content: userMessage
      });

      const requestBody = {
        model: 'gemini-fast',
        messages: [
          {
            role: 'system',
            content: this.systemPrompt
          },
          ...this.conversationHistory
        ],
        temperature: 0.7,
        max_tokens: 500,
        stream: false
      };

      const response = await axios.post(API_BASE_URL, requestBody, {
        headers: {
          'Authorization' : `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        }
      });

      const assistantMessage = response.data.choices[0].message.content;

      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage
      });

      return {
        success: true,
        message: assistantMessage,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      console.error('socBot API Error:', error);
      
      const fallbackMessage = "I'm experiencing some technical difficulties right now. In the meantime, you can:\n\n• Check our FAQ page for common questions\n• Browse our project ideas\n• Join our Discord community for direct support\n• Contact mentors directly via email\n\nI'll be back online soon to help with your GSOC questions!";
      
      return {
        success: false,
        message: fallbackMessage,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  getHistory(): { role: string; content: string; }[] {
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
      "What programming languages and technologies should I know?",
      "How do I make my first contribution to pollinations.ai?"
    ];
  }
}

export default socBotAPI;
