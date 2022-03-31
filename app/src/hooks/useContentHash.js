import { useEffect, useState } from 'react';

export default useContentHash = (contentID) => {
  const params = useParams();
  const history = useHistory();

  debug('location pathname', params);

  const contentIDFromHash = params?.hash;

  const setHash = (newHash, replace = true) => (replace ? history.replace(`/p/${newHash}/`) : history.push(`/p/${newHash}/`));

  // Update the hash when the content ID changes and the updateHashCondition is met
  // We don't update the hash on each CID change to not pollute the browser history
  useEffect(() => {
    if (contentID && contentID !== contentIDFromHash) {
      debug('contentID changed to', contentID, 'updating hash');
      setHash(contentID);
    }
  }, [contentID]);

  return contentIDFromHash;
};
