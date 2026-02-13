import {LINK, TITLE} from './link.js';
import { Devvit} from '@devvit/public-api';

Devvit.configure({
  redditAPI: true,
  media: true,
});

Devvit.addTrigger({
  event: 'AppUpgrade',
  onEvent: async (event, context) => {
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




































