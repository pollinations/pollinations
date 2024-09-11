const GIFEncoder = require('gif-encoder-2')
const { createCanvas, Image } = require('canvas')

async function gifCreator(destination) {

    const algorithm = 'neuquant'

    // find the width and height of the image
    const width=512, height=512;

    // create a write stream for GIF data
    const writeStream = destination

    const encoder = new GIFEncoder(width, height, algorithm)
    // pipe encoder's read stream to our write stream
    encoder.createReadStream().pipe(writeStream)
    encoder.start()
    encoder.setDelay(200)

    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')


    function showImage(url) {
        const image = new Image()
        image.onload = () => {
          ctx.drawImage(image, 0, 0)
          encoder.addFrame(ctx)
        }
        image.src = url
    }
    
    return {
        showImage,
        finish: () => encoder.finish()
    }
    

}

createGif()
// createGif('octree')