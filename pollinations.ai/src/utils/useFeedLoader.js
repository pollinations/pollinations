import { useEffect, useState } from 'react';
import { isMature } from '../utils/mature';


export function useFeedLoader(onNewImage, setLastImage) {
  const [imagesGenerated, setImagesGenerated] = useState(estimateGeneratedImages());

  useEffect(() => {
    const getEventSource = () => {
      const imageFeedSource = new EventSource("https://image.pollinations.ai/feed");
      imageFeedSource.onmessage = evt => {
        const data = JSON.parse(evt.data);
        setImagesGenerated(no => no + 1);
        // lastServerLoad = data["concurrentRequests"];
        if (data["status"] === "end_generating")
          setLastImage(data);

        const urlParams = new URLSearchParams(window.location.search);
        const nsfwParam = urlParams.get('nsfw');

        if (nsfwParam !== 'true') {
          if (data["nsfw"] || data["isChild"]) {
            // console.log("Skipping NSFW content:", data["nsfw"], );
            return;
          }
          if (data["imageURL"]) {
            if (!data["prompt"]) {
              console.error("No prompt found in image data", data, "Why???");
              onNewImage(data);
              return;
            }
            const matureWord = isMature(data["prompt"] || "");
            if (matureWord) {
              // console.log("Skipping mature word:", matureWord, data["prompt"]);
              return;
            }
            onNewImage(data);
          }
        } else {
          if (data["imageURL"]) {
            onNewImage(data);
          }
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

  return { imagesGenerated };
}

function estimateGeneratedImages() {
  const launchDate = 1738974161902;
  const now = Date.now();
  const differenceInSeconds = (now - launchDate) / 1000;
  const imagesGeneratedSinceLaunch = Math.round(differenceInSeconds * 23.78); // ~100,000 images per hour

  const imagesGeneratedCalculated = 117772000 + imagesGeneratedSinceLaunch;
  return imagesGeneratedCalculated;
}
