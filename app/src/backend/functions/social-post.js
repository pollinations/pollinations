
/** Cut & Paste Node.js Code **/
import SocialPost from "social-post-api"; 
import { IPFSState } from "../../network/ipfsClient";
import readMetadata from "../notebookMetadata";
import { getCoverImage, getCoverVideo } from "../../components/MediaViewer";
// Live API Key
const social = new SocialPost(process.env["AYRSHARE_KEY"]);


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

async function doPost({input, modelTitle, videoURL, coverImage, url}) {

  const inputs = JSON.stringify(input,null, 4);
  
  // TODO: this shouldn't need to be hard coded
  // change inputs from object to list to get order
  const principal_input = inputs["text_input"];

  const { post, title } = formatPostAndTitle(modelTitle, principal_input, inputs, url);

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

// console.log(postResult)


function formatPostAndTitle(modelTitle, input, inputs, url) {
  const title = `${modelTitle}: ${input}`;

  const post = `# ${title}

## Inputs
${inputs}

## Results
${url}

${followText}`;
  return { post, title };
}




export default handler = async ({path}) => {

    const cid = path.split("/").slice(-1)[0];
    // your server-side functionality
    console.log("cid",cid);
    const ipfs = await IPFSState(cid);
    console.log("ipfs",ipfs);
    const { name } = readMetadata(ipfs["notebook.ipynb"]);
    const coverImage = getCoverImage(ipfs.output);
    const videoURL = getCoverVideo(ipfs.output);
    const url = `https://pollinations.ai/p/${cid}`;
    console.log("Calling post",{modelTitle:name, input: ipfs.input, videoURL, coverImage, url});
    const postResult = await doPost({modelTitle:name, input: ipfs.input, videoURL, coverImage, url});

    return {
      statusCode: 200,
      body: JSON.stringify(postResult)
  };

}



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

