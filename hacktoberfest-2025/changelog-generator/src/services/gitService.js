import axios from 'axios';

export const fetchCommits = async (repoName, limit = 50) => {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${repoName}/commits`,
      {
        params: {
          per_page: limit,
        },
      }
    );

    return response.data.map(commit => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: commit.commit.author.name,
      date: commit.commit.author.date,
      url: commit.html_url,
    }));
  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error('Repository not found. Please check the repository name.');
    }
    throw new Error('Failed to fetch commits. Please try again.');
  }
};

export const categorizeCommit = (message) => {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.startsWith('feat:') || lowerMessage.startsWith('feature:')) {
    return 'feat';
  }
  if (lowerMessage.startsWith('fix:')) {
    return 'fix';
  }
  if (lowerMessage.startsWith('docs:')) {
    return 'docs';
  }
  if (lowerMessage.startsWith('style:')) {
    return 'style';
  }
  if (lowerMessage.startsWith('refactor:')) {
    return 'refactor';
  }
  if (lowerMessage.startsWith('test:')) {
    return 'test';
  }
  if (lowerMessage.startsWith('chore:')) {
    return 'chore';
  }

  return 'other';
};
