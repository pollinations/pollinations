import axios from "axios";

export const generateChangelogEntry = async (commitMessage) => {
  try {
    const prompt = `
Rewrite the following Git commit message as a friendly, human-readable changelog entry.
Make it concise (one sentence), positive, and clear — like what you’d write in a release note.
Commit message: "${commitMessage}"
Return only the rewritten sentence without any extra text.
`;

    const response = await axios.post(
      "https://text.pollinations.ai/text",
      {
        model: "openai",
        messages: [
          {
            role: "system",
            content: "You are a professional changelog writer.",
          },
          { role: "user", content: prompt },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const textOutput =
      response.data.output ||
      response.data.text ||
      response.data.message ||
      response.data.response ||
      commitMessage;

    return textOutput.trim();
  } catch (error) {
    console.error("Error generating changelog entry:", error.message);
    return commitMessage;
  }
};
