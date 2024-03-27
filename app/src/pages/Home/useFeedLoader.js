import { useEffect, useState, useCallback } from 'react';
import { isMature } from '../../data/mature';

export function useFeedLoader(onNewImage, setServerLoad) {
  const [imagesGenerated, setImagesGenerated] = useState(estimateGeneratedImages());
  const [isPaused, setIsPaused] = useState(false);

  const getEventSource = useCallback(() => {
    const imageFeedSource = new EventSource("https://image.pollinations.ai/feed");
    imageFeedSource.onmessage = evt => {
      if (isPaused) return;
      const data = JSON.parse(evt.data);
      setImagesGenerated(no => no + 1);
      lastServerLoad = data["concurrentRequests"];
      setServerLoad(lastServerLoad);
      if (data["nsfw"]) {
        console.log("Skipping NSFW content:", data["nsfw"], data);
        return;
      }
      if (data["imageURL"]) {
        const matureWord = isMature(data["prompt"]);
        if (matureWord) {
          console.log("Skipping mature word:", matureWord, data["prompt"]);
          return;
        }
        onNewImage(data);
      }
    };
    return imageFeedSource;
  }, [isPaused, onNewImage, setServerLoad]);

  useEffect(() => {
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
  }, [getEventSource]);

  const pause = useCallback((value) => {
    setIsPaused(value);
  }, []);

  return { imagesGenerated, pause };
}

function estimateGeneratedImages() {
  const launchDate = 1701718083442;
  const now = Date.now();
  const differenceInSeconds = (now - launchDate) / 1000;
  const imagesGeneratedSinceLaunch = Math.round(differenceInSeconds * 3);

  const imagesGeneratedCalculated = 9000000 + imagesGeneratedSinceLaunch;
  return imagesGeneratedCalculated;
}

let lastServerLoad = 0;

export const getLastServerLoad = () => lastServerLoad;