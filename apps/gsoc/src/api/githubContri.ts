import { useState, useEffect } from 'react';

const useTopContributors = () => {
  const [contributors, setContributors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContributors = async () => {
      try {
        const response = await fetch('/api/github/contributors');

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        setContributors(Array.isArray(data) ? data.slice(0, 10) : []);
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
