/** Cut & Paste Node.js Code **/
import SocialPost from "social-post-api"; // Install "npm i social-post-api"

// Live API Key
const social = new SocialPost("6FE4JJ0-2P94JT3-PN81AYX-ARRKJR4");



const coverImage = "https://pollinations.ai/ipfs/QmWGQoQ62YAvLbKpkpiCcTRR7wdbfZmseMMkerGJLZ1w4Q/image.png?filename=vibrant-painting-of-a-ufo-in-the-style-of-magritte_00695.png";

const videoURL = "https://pollinations.ai/ipfs/Qmd5BFthKPeWPbSHRtK9RpcNxgSA9HZ7YuTFLxdf8NJijb?filename=vibrant-painting-of-a-ufo-in-the-style-of-magritte_3.mp4";

const url = "https://pollinations.ai/p/QmTTAoSKLAYzE4QgzLUdmfSP4TwcNdiDWdYuo6WPtMJjLT"; 

const followText =
`
## Create
https://pollinations.ai

## Follow
https://fb.com/pollinations
https://twitter.com/pollinations_ai
https://instagram.com/pollinations_ai
`;


const modelTitle = "Text-to-Image (L2V)";

const input = "Vibrant painting of a UFO in the style of Magritte.";

const inputs = 
`{
  "num_iterations": 700
  "text_input":"Vibrant painting of a UFO in the style of Magritte. "
  "text_not":"disconnected, confusing, incoherent, cluttered, watermarks, text, writing"
}`;

async function doPost({inputs, modelTitle, videoURL, coverImage, url}) {

  const { post, title } = formatPostAndTitle(modelTitle, inputs, url);

  const shareConfig = {
    post,
    title,
    // Required if platform includes "reddit." Subreddit to post.
    //subreddit: "MediaSynthesis",
    youTubeOptions: {
      title,       // required: Video Title
      youTubeVisibility: "public", // optional: "public", "unlisted", or "private" - default "private"
      /** Important Thumbnail information below **/
      thumbNail: coverImage, // optional: URL of a JPEG or PNG and less than 2MB
      // playListId: "PLrav6EfwgDX5peD7Ni-pOKa7B13WjLyUB" // optional: Playlist ID to add the video
    },
    shortenLinks: false,
    "mediaUrls": [videoURL]
  };

  const res1 = 
    await social.post({
      ...shareConfig,
      "platforms": ["facebook","youtube","instagram","linkedin"]
    }).catch(console.error);

  const res2 = await social.post({
    ...shareConfig,
    post: `${title} ${url}`,

    "platforms": ["twitter"],
    "mediaUrls": [coverImage]
  }).catch(console.error);

  return [res1,res2];
}

const postResult = await doPost({modelTitle, inputs, videoURL, coverImage, url});

console.log(postResult)


function formatPostAndTitle(modelTitle, inputs, url) {
  const title = `${modelTitle}: ${input}`;

  const post = `# ${title}

## Inputs
${inputs}

## Results
${url}

${followText}`;
  return { post, title };
}
// {
//   post: "YouTube Description",      // required: Video description
//   platforms: ["youtube"],           // required
//   mediaUrls: ["https://images.ayrshare.com/imgs/test-video-1.mp4"], // required: URL of video, 1 allowed               
//   youTubeOptions: {
//       title: "YouTube Title",       // required: Video Title
//       youTubeVisibility: "private", // optional: "public", "unlisted", or "private" - default "private"
//       /** Important Thumbnail information below **/
//       thumbNail: "https://images.ayrshare.com/imgs/GhostBusters.jpg", // optional: URL of a JPEG or PNG and less than 2MB
//       playListId: "PLrav6EfwgDX5peD7Ni-pOKa7B13WjLyUB" // optional: Playlist ID to add the video
//   }
// }



// {
//   "faceBookOptions": {
//     "carousel": {
//       "link": "URL of See More At...",
//       "items": [
//         {
//           "name": "Image name",
//           "link": "URL when image clicked",
//           "picture": "URL of image"
//         },
//         {
//           "name": "Image name",
//           "link": "URL when image clicked",
//           "picture": "URL of image"
//         }
//       ]
//     }
//   }
// }


// {
//   "faceBookOptions": {
//     "mediaCaptions": ["This is my best pic", "😃 here is the next one"]
//   }
// }


// You can mention another Facebook Page by including the following in the post text. Note, Premium or Business Plan required for mentions.
// @[page-id]


