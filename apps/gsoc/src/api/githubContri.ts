import { useState, useEffect } from 'react';

const useTopContributors = () => {
  const [contributors, setContributors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchContributors = async () => {
      try {
        const response = await fetch(
          'https://api.github.com/repos/pollinations/pollinations/contributors?per_page=10&sort=contributions',
          {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'Authorization': `token ${import.meta.env.VITE_GSOC_APP_GITHUB_TOKEN}`
            }
          }
        );

        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status}`);
        }

        const data = await response.json();
        
        const filteredContributors = data.filter((contributor: { login: string }) => 
          !contributor.login.includes("[bot]") && !contributor.login.includes("dependabot")
        );
        
        setContributors(filteredContributors.slice(0, 10));
        setError(null);
      } catch (err) {
        console.error('Error fetching contributors:', err);
        setError((err as any).message);
        setContributors([]);
      } finally {
        setLoading(false);
      }
    };

    fetchContributors();
  }, []);

  return { contributors, loading, error };
};

export default useTopContributors;
