import { useEffect, useState, useCallback, useRef } from 'react';
import { useInterval } from 'usehooks-ts';
import { getLastServerLoad } from './useFeedLoader';
import debug from 'debug';

const log = debug('useImageSlideshow');

export function useImageSlideshow() {
  const [image, setImage] = useState({});
  const [loadingImages, setLoadingImages] = useState([]);
  const [isStopped, stop] = useState(false);

  const nextImage = useCallback(async () => {
    if (loadingImages.length > 0) {
      const [img, ...reducedLoadingImages] = loadingImages;
      setImage(img);
      try {
        const loadedImage = await loadImage(img);
        setImage(loadedImage);
      } catch (error) {
        console.error("Failed to load image", error);
      }
      setLoadingImages(reducedLoadingImages);
    }
  }, [loadingImages]);

  useInterval(() => {
    if (!isStopped) nextImage();
  }, 3000);

  const onNewImage = useCallback((newImage) => {
    setLoadingImages(images => [...images, newImage]);
  }, []);

  return { image, onNewImage, stop };
}

export function useImageEditor({ stop, image }) {
  const [isLoading, setIsLoading] = useState(false);
  const [editedImage, setEditedImage] = useState(null);

  const updateImage = useCallback(async (newImage) => {
    stop(true);
    setIsLoading(true);
    const loadedImage = await loadImage(newImage);
    setEditedImage(loadedImage);
    setIsLoading(false);
  }, [stop]);

  image = editedImage || image;

  return { updateImage, image, isLoading };
}

const loadImage = async (newImage) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = newImage.imageURL;
    img.onload = () => resolve({
      ...newImage,
      loaded: true,
    });
    img.onerror = (error) => reject(error);
  });
};