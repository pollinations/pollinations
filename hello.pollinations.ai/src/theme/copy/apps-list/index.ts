// Project imports for Pollinations AI 2
// Auto-generated - do not edit manually

import { creativeProjects } from './creative.js';
import { chatProjects } from './chat.js';
import { gamesProjects } from './games.js';
import { devToolsProjects } from './devTools.js';
import { learnProjects } from './learn.js';
import { socialBotsProjects } from './socialBots.js';
import { vibesProjects } from './vibes.js';

// All projects combined with category tags
export const allProjects = [
  ...creativeProjects.map(p => ({ ...p, category: 'creative' })),
  ...chatProjects.map(p => ({ ...p, category: 'chat' })),
  ...gamesProjects.map(p => ({ ...p, category: 'games' })),
  ...devToolsProjects.map(p => ({ ...p, category: 'devtools' })),
  ...learnProjects.map(p => ({ ...p, category: 'learn' })),
  ...socialBotsProjects.map(p => ({ ...p, category: 'socialbots' })),
  ...vibesProjects.map(p => ({ ...p, category: 'vibes' })),
];

// Re-export individual categories
export {
  creativeProjects,
  chatProjects,
  gamesProjects,
  devToolsProjects,
  learnProjects,
  socialBotsProjects,
  vibesProjects,
};
