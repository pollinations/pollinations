import { debug } from '../utils/debug.js';

const log = debug('ads:config');

/**
 * Ad system configuration
 */
export const AD_CONFIG = {
  // Feature flag to enable nex.ad integration
  USE_NEX_AD: process.env.USE_NEX_AD === 'true' || false,
  
  // Percentage of requests to use nex.ad (for gradual rollout)
  NEX_AD_ROLLOUT_PERCENTAGE: parseInt(process.env.NEX_AD_ROLLOUT_PERCENTAGE || '0', 10),
  
  // Fallback to affiliate system if nex.ad fails
  FALLBACK_TO_AFFILIATES: process.env.FALLBACK_TO_AFFILIATES !== 'false'
};

/**
 * Check if nex.ad should be used for this request
 * @returns {boolean}
 */
export function shouldUseNexAd() {
  if (!AD_CONFIG.USE_NEX_AD) {
    return false;
  }
  
  // Check rollout percentage
  if (AD_CONFIG.NEX_AD_ROLLOUT_PERCENTAGE < 100) {
    const random = Math.random() * 100;
    const useNexAd = random < AD_CONFIG.NEX_AD_ROLLOUT_PERCENTAGE;
    log(`Rollout check: ${random} < ${AD_CONFIG.NEX_AD_ROLLOUT_PERCENTAGE} = ${useNexAd}`);
    return useNexAd;
  }
  
  return true;
}

log('Ad system configuration:', AD_CONFIG);
