import debug from 'debug';

const log = debug('pollinations:nexad:formatter');
const errorLog = debug('pollinations:nexad:formatter:error');

/**
 * Convert HTML to Markdown
 * @param {string} html - HTML content
 * @returns {string} - Markdown content
 */
function htmlToMarkdown(html) {
  if (!html) return '';
  
  // Simple HTML to Markdown conversion
  let markdown = html;
  
  // Convert links
  markdown = markdown.replace(/<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '[$2]($1)');
  
  // Remove any remaining HTML tags
  markdown = markdown.replace(/<[^>]+>/g, '');
  
  // Clean up whitespace
  markdown = markdown.trim();
  
  return markdown;
}

/**
 * Format nex.ad response into our standard ad format
 * @param {Object} nexAdData - Response from nex.ad API
 * @returns {string|null} - Formatted ad text or null
 */
export function formatNexAd(nexAdData) {
  try {
    if (!nexAdData?.ads?.[0]) {
      log('No ads in nex.ad response');
      return null;
    }
    
    const ad = nexAdData.ads[0];
    
    // Extract ad content
    let adContent = '';
    
    if (ad.native_ad?.description) {
      adContent = ad.native_ad.description;
    } else if (ad.text_ad?.text) {
      adContent = ad.text_ad.text;
    } else {
      errorLog('Unknown ad format:', ad);
      return null;
    }
    
    // Convert HTML to Markdown
    const markdownContent = htmlToMarkdown(adContent);
    
    if (!markdownContent) {
      errorLog('Empty ad content after conversion');
      return null;
    }
    
    // Format with our standard ad prefix
    const formattedAd = `\n---\n\n🌸 **Ad** 🌸\n${markdownContent}`;
    
    log('Formatted ad:', formattedAd);
    
    return formattedAd;
  } catch (error) {
    errorLog('Error formatting nex.ad response:', error);
    return null;
  }
}

/**
 * Extract tracking data from nex.ad response
 * @param {Object} nexAdData - Response from nex.ad API
 * @returns {Object} - Tracking URLs and metadata
 */
export function extractTrackingData(nexAdData) {
  try {
    if (!nexAdData?.ads?.[0]) {
      return null;
    }
    
    const ad = nexAdData.ads[0];
    
    return {
      tid: nexAdData.tid,
      campaign_id: ad.campaign_id,
      ad_id: ad.ad_id,
      ad_type: ad.ad_type,
      click_through_url: ad.click_through,
      impression_urls: ad.tracking_urls?.impression_urls || [],
      click_urls: ad.tracking_urls?.click_urls || []
    };
  } catch (error) {
    errorLog('Error extracting tracking data:', error);
    return null;
  }
}

/**
 * Track ad impression by calling nex.ad tracking URLs
 * @param {Object} trackingData - Tracking data from extractTrackingData
 * @returns {Promise<void>}
 */
export async function trackImpression(trackingData) {
  if (!trackingData?.impression_urls?.length) {
    return;
  }
  
  try {
    // Fire all impression tracking URLs
    const trackingPromises = trackingData.impression_urls.map(url => 
      fetch(url, { method: 'GET' })
        .catch(err => errorLog('Impression tracking error:', err))
    );
    
    await Promise.all(trackingPromises);
    log('Tracked ad impression for tid:', trackingData.tid);
  } catch (error) {
    errorLog('Error tracking impression:', error);
  }
}
