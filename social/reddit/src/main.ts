import { Devvit} from '@devvit/public-api';
import * as fs from 'fs';

Devvit.configure({
  redditAPI: true,
  media: true,
});

let LINK = '';
let TITLE = '';

try {
  console.log("Running the devvit app!")
  const configPath = '/root/reddit_post_automation/src/postConfig.json';
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    LINK = config.imageLink || '';
    TITLE = config.title || '';
  }
} catch (error) {
  console.warn('postConfig.json not found, will use environment variables if available');
}

Devvit.addTrigger({
  event: 'AppUpgrade',
  onEvent: async (event, context) => {
    if (!LINK || !TITLE) {
      console.error('❌ Image link and title are required in postConfig.json');
      process.exit(1);
    }

    try {
      console.log('🚀 Starting to post image to Reddit...');
      const imageAsset = await context.media.upload({
        url: LINK,
        type: 'image',
      });
      console.log('✅ Image uploaded to Devvit Media Service:', imageAsset.mediaUrl);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const post = await context.reddit.submitPost({
        subredditName: "pollinations_ai",
        title: TITLE,
        kind: 'image',
        imageUrls: [imageAsset.mediaUrl],
      });
      console.log(`✅ Posted image with ID: ${post.id}`);
      console.log('Post successful. Exiting...');
      process.exit(0);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('being created asynchronously')) {
        console.log('✅ Image is being posted asynchronously and will appear soon');
        process.exit(0);
      } else {
        console.error('❌ Error posting image:', error);
        process.exit(1);
      }
    }
  },
});

export default Devvit;





