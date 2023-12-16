import GIFEncoder from 'gif-encoder-2';
import { createCanvas, Image } from 'canvas';

export function gifCreator(destination) {
  destination.writeHead(200, { 'Content-Type': 'image/gif' });
  const algorithm = 'neuquant';

  // find the width and height of the image
  const width = 256, height = 256;

  // create a write stream for GIF data
  const writeStream = destination;

  const encoder = new GIFEncoder(width, height, algorithm);
  // pipe encoder's read stream to our write stream
  encoder.createReadStream().pipe(writeStream);
  encoder.start();
  encoder.setDelay(1);
  encoder.setRepeat(-1);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');


  const showImage = (url) => new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      ctx.drawImage(image, 0, 0);
      encoder.addFrame(ctx);
      resolve();
    };
    image.src = url;
  });


  return {
    showImage,
    finish: () => encoder.finish()
  };


}
