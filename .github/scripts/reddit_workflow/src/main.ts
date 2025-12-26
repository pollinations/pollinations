import {LINK, TITLE} from './link.js';
import { Devvit } from '@devvit/public-api';

Devvit.configure({
  redditAPI: true,
  media: true,
});

Devvit.addTrigger({
  event: 'AppUpgrade',
  onEvent: async (event, context) => {
    try {
      const imageAsset = await context.media.upload({
        url: LINK,
        type: 'image',
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));

      const post = await context.reddit.submitPost({
        subredditName: 'pollinations_ai',
        title: TITLE,
        kind: 'image',
        imageUrls: [imageAsset.mediaUrl],
      });

      console.log(`Posted image with ID: ${post.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('being created asynchronously')) {
        console.log('✅ Image is being posted asynchronously and will appear soon');
      } else {
        console.error('❌ Error posting image:', error);
      }
    }
  },
});

export default Devvit;
