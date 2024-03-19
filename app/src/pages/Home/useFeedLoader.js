import { useEffect, useState } from 'react';
import { isMature } from '../../data/mature';

export function useFeedLoader(onNewImage) {
  const [serverLoad, setServerLoad] = useState(0);
  const [imagesGenerated, setImagesGenerated] = useState(estimateGeneratedImages());

  useEffect(() => {
    const getEventSource = () => {
      const imageFeedSource = new EventSource("https://image.pollinations.ai/feed");
      imageFeedSource.onmessage = evt => {
        const data = JSON.parse(evt.data);
        setServerLoad(data["concurrentRequests"]);
        if (data["nsfw"]) {
          console.log("Skipping NSFW content:", data["nsfw"], data);
          return;
        }
        if (data["imageURL"]) {
          setImagesGenerated(no => no + 1);
          const matureWord = isMature(data["prompt"]) && false;
          if (matureWord) {
            console.log("Skipping mature word:", matureWord, data["prompt"]);
            return;
          }
          onNewImage(data);
        }
      };
      return imageFeedSource;
    };

    let eventSource = getEventSource();

    eventSource.onerror = async () => {
      await new Promise(r => setTimeout(r, 1000));
      console.log("Event source error. Closing and re-opening.");
      eventSource.close();
      eventSource = getEventSource();
    };

    return () => {
      eventSource.close();
    };
  }, [onNewImage]);

  return { serverLoad, imagesGenerated };
}

function estimateGeneratedImages() {
  const launchDate = 1701718083442;
  const now = Date.now();
  const differenceInSeconds = (now - launchDate) / 1000;
  const imagesGeneratedSinceLaunch = Math.round(differenceInSeconds * 3);

  const imagesGeneratedCalculated = 9000000 + imagesGeneratedSinceLaunch;
  return imagesGeneratedCalculated;
}
