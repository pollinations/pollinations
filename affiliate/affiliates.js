// Consolidated affiliate data for both redirect service and ad generation
// This file serves as the single source of truth for all affiliate information

// Define affiliates as a structured JSON object with all necessary data
const affiliates = [
  {
    id: "1422856",
    name: "Martinic Audio",
    product: "Martinic Kee Bass VST/AU plugin",
    description: "Get a free license for the Martinic Kee Bass VST/AU plugin, modeled on the original.",
    audience: "Music producers and sound designers looking for high-quality virtual instruments.",
    categories: ["Music & Audio", "Software"],
    trackingLink: "https://martinic.evyy.net/c/6058776/1422856/4482",
    triggerWords: ["bass plugin", "VST", "VST plugin", "music production", "audio plugin", "synthesizer", "music software", "DAW", "audio production", "instrument plugin"]
  },
  {
    id: "432264",
    name: "NordVPN",
    product: "NordVPN subscription service for secure internet browsing.",
    description: "Secure your internet browsing with a NordVPN subscription.",
    audience: "Individuals seeking online privacy and security.",
    categories: ["Software", "Internet Service Provider", "Security"],
    trackingLink: "https://nordvpn.sjv.io/c/6058776/432264/7452",
    triggerWords: ["VPN", "privacy", "online security", "secure browsing", "internet privacy", "encryption", "IP hiding", "private network", "cybersecurity", "data protection"]
  },
  // {
  //   id: "1548053",
  //   name: "jAlbum Affiliate Program",
  //   product: "jAlbum software for creating digital photo albums.",
  //   description: "Create and share digital photo albums online with jAlbum software.",
  //   audience: "Individuals and professionals looking to create and share photo albums online.",
  //   categories: ["Apps", "Creative Digital Assets", "Photography"],
  //   trackingLink: "https://jalbum-affiliate-program.sjv.io/c/6058776/1548053/17916",
  //   triggerWords: ["photo album", "digital album", "image gallery", "photo sharing", "photography", "picture collection", "photo organization", "photo management", "image hosting", "photo portfolio"]
  // },
  {
    id: "1630115",
    name: "Soundcore",
    product: "Soundcore audio products and accessories",
    description: "Shop high-quality Soundcore audio products and accessories.",
    audience: "Consumers looking for high-quality audio products and accessories",
    categories: ["Consumer Electronics", "Accessories & Peripherals"],
    trackingLink: "https://soundcore.sjv.io/c/6058776/1630115/18028",
    triggerWords: ["headphones", "earbuds", "speakers", "audio equipment", "sound quality", "bluetooth speakers", "wireless audio", "music devices", "audio accessories", "premium sound"]
  },
  {
    id: "2073393",
    name: "CapCut Affiliate Program",
    product: "Logo and banner design services offered by CapCut.",
    description: "Enhance your brand with professional logo and banner design from CapCut.",
    audience: "Individuals and businesses looking to enhance their brand identity with a professional logo and banners.",
    categories: ["Creative Digital Assets", "Graphic Design"],
    tags: ["New logo and banners"],
    trackingLink: "https://capcutaffiliateprogram.pxf.io/c/6058776/2073393/22474",
    triggerWords: ["logo design", "banner design", "graphic design", "brand identity", "visual branding", "company logo", "marketing graphics", "design services", "branding elements", "creative design"]
  },
  {
    id: "2144039",
    name: "Clawcloud (Singapore) Private Limited",
    product: "Dedicated VPS hosting with high bandwidth and service availability.",
    description: "Get reliable dedicated VPS hosting with high bandwidth from Clawcloud, starting at $10/mo.",
    audience: "Businesses and individuals seeking reliable and high-performance web hosting solutions.",
    categories: ["Internet Service Provider", "Web Hosting"],
    tags: ["webhosting", "VPS", "dedicated VPS"],
    trackingLink: "https://clawcloudsingaporeprivatelimited.sjv.io/c/6058776/2144039/26865",
    triggerWords: ["web hosting", "VPS", "dedicated server", "cloud hosting", "server hosting", "hosting service", "virtual private server", "website hosting", "hosting provider", "bandwidth"]
  },
  {
    id: "2774941",
    name: "HeyReal.ai",
    product: "AI companion service",
    description: "Create your own AI companion on HeyReal.ai.",
    audience: "Users interested in AI chatbots, virtual companions, and character interaction.",
    categories: ["AI Tools", "Chatbots", "Entertainment", "Social"],
    trackingLink: "https://go.sjv.io/c/6058776/2774941/30752",
    triggerWords: ["ai chatbot", "character ai", "virtual companion", "ai chat", "realistic ai", "custom ai character", "talk to ai"],
    weight: 2.0
  },
  // {
  //   id: "lovemy",
  //   name: "LoveMy.ai",
  //   product: "An AI companion that offers personalized interactions and intimacy.",
  //   description: "Create your intimate AI companion on LoveMy.ai",
  //   audience: "Individuals seeking an intimate and personalized AI companionship experience.",
  //   categories: ["AI", "Entertainment", "Digital Companions", "NSFW"],
  //   nsfw: true,
  //   trackingLink: "https://lovemy.ai/?via=pollinations",
  //   triggerWords: ["ai companion", "virtual companion", "ai girlfriend", "ai boyfriend", "digital companion", "ai relationship", "virtual relationship", "ai character", "ai chat", "intimate ai"]
  // },
  // {
  //   id: "hentaiai",
  //   name: "Hentai.ai",
  //   product: "AI-generated anime-style adult content.",
  //   description: "Create custom anime-style adult content with AI on Hentai.ai",
  //   audience: "Adult content consumers interested in anime and manga style artwork.",
  //   categories: ["Entertainment", "NSFW", "Adult Content", "AI Art"],
  //   nsfw: true,
  //   trackingLink: "https://hentai.ai/?via=pollinations",
  //   triggerWords: ["hentai", "anime", "manga", "adult content", "NSFW", "uncensored", "adult chat", "fantasy chat", "anime characters", "adult anime"]
  // },
  {
    id: "kofi",
    name: "Support Pollinations on Ko-fi",
    product: "Donation platform for creators.",
    description: "Support Pollinations AI with a donation on Ko-fi",
    audience: "Individuals who appreciate Pollinations' services and want to support the platform.",
    categories: ["Donation", "Support"],
    tags: ["donation", "support"],
    ad_text: "Powered by Pollinations.AI free text APIs. [Support our mission]({url}) to keep AI accessible for everyone.",
    trackingLink: "https://ko-fi.com/pollinationsai",
    triggerWords: ["donation", "support creators", "creator support", "funding", "tip jar", "financial support", "creator economy", "patronage", "buy me a coffee", "contribute"],
    weight: 1.5
  },
  {
    id: "25841",
    name: "Kodak Photo Printer",
    product: "Portable photo printers",
    description: "Get $10 OFF Kodak Mini 2 retro portable printer and Kodak Dock Plus retro printer.",
    audience: "Individuals wanting to print photos from their smartphones or devices.",
    categories: ["Consumer Electronics", "Printers", "Photography", "Gadgets"],
    trackingLink: "https://primedigitalmarketing.pxf.io/c/6058776/2902339/25841",
    triggerWords: ["photo printer", "instant camera", "printing photos", "photo quality", "portable printer", "image printing", "digital prints", "instant printing", "photo paper", "photography equipment"]
  },
  {
    id: "200613",
    name: "SentryPC",
    product: "Parental control and monitoring software",
    description: "Monitor and manage your children's computer activities with SentryPC parental control software.",
    audience: "Parents concerned about their children's online activities and screen time.",
    categories: ["Software", "Parental Control", "Security"],
    trackingLink: "https://sentrypc.pxf.io/c/6058776/200613/3255",
    triggerWords: ["parental control", "child monitoring", "screen time", "internet safety", "computer monitoring", "child protection", "online safety", "web filtering", "activity tracking", "family safety"]
  },
  {
    id: "1462842",
    name: "ExpressVPN",
    product: "VPN service for secure and private internet browsing",
    description: "Protect your online privacy and security with ExpressVPN's high-speed encrypted connections.",
    audience: "Individuals concerned about online privacy and security.",
    categories: ["Software", "Internet Service Provider", "Security"],
    trackingLink: "https://www.xvbelink.com/?a_fid=pollinations&url=https%3A%2F%2Fwww.expressvpn.com%2F",
    triggerWords: ["VPN", "privacy", "online security", "secure browsing", "internet privacy", "encryption", "IP hiding", "private network", "cybersecurity", "data protection"]
  },
  {
    id: "1099744",
    name: "Cowinaudio",
    product: "Noise-cancelling headphones and audio equipment",
    description: "Experience premium sound quality with Cowin's noise-cancelling headphones and audio products.",
    audience: "Music enthusiasts and professionals seeking high-quality audio equipment.",
    categories: ["Consumer Electronics", "Audio Equipment"],
    trackingLink: "https://cowinaudio.pxf.io/c/6058776/1099744/13624",
    triggerWords: ["headphones", "noise cancelling", "audio equipment", "wireless headphones", "bluetooth headphones", "sound quality", "music listening", "audio accessories", "premium sound", "wireless audio"]
  },
  {
    id: "2882892",
    name: "Doodle",
    product: "Scheduling and calendar management software",
    description: "Simplify meeting scheduling and time management with Doodle's automated scheduling tools.",
    audience: "Professionals and teams looking to optimize scheduling and time management.",
    categories: ["Software", "Productivity", "Business Tools"],
    trackingLink: "https://doodle.pxf.io/c/6058776/2882892/32965",
    triggerWords: ["scheduling", "calendar", "meeting planner", "time management", "appointment scheduling", "team coordination", "availability", "booking system", "productivity tool", "meeting organization"]
  },
  {
    id: "242590",
    name: "Lenovo",
    product: "Computers, laptops, and electronic devices",
    description: "Shop for Lenovo computers, laptops, and electronic devices with special deals.",
    audience: "Consumers and businesses looking for quality computers and electronic devices.",
    categories: ["Consumer Electronics", "Computers", "Technology"],
    trackingLink: "https://lenovo.dgi7au.net/c/6058776/242590/4036",
    triggerWords: ["lenovo", "laptops", "desktops", "computer hardware", "electronics", "hong kong electronics", "pc", "computer deals"]
  },
  {
    id: "1166330",
    name: "Electronicx",
    product: "Car batteries and automotive electronics",
    description: "Purchase AGM car starter batteries and other automotive electronics from Electronicx.",
    audience: "Car owners and automotive enthusiasts looking for reliable batteries and electronics.",
    categories: ["Automotive", "Electronics"],
    trackingLink: "https://electronicx.pxf.io/c/6058776/1166330/14322",
    triggerWords: ["car battery", "automotive electronics", "AGM battery", "car accessories", "vehicle electronics", "car parts", "auto electronics", "starter battery", "car maintenance", "automotive parts"]
  },
  {
    id: "1168108",
    name: "Muc-Off",
    product: "Bike and motorcycle cleaning products",
    description: "Keep your bike or motorcycle clean with Muc-Off's premium cleaning products.",
    audience: "Cyclists and motorcycle enthusiasts who want to maintain their vehicles.",
    categories: ["Automotive", "Cycling", "Maintenance"],
    trackingLink: "https://mucoff.sjv.io/c/6058776/1168108/14325",
    triggerWords: ["bike cleaner", "motorcycle cleaner", "car wash", "pressure washer", "vehicle maintenance", "cleaning supplies", "bike maintenance"]
  },
  {
    id: "1168108",
    name: "Muc-Off",
    product: "Bike and motorcycle cleaning products",
    description: "Keep your bike or motorcycle clean with Muc-Off's premium cleaning products.",
    audience: "Cyclists and motorcycle enthusiasts who want to maintain their vehicles.",
    categories: ["Automotive", "Cycling", "Maintenance"],
    trackingLink: "https://mucoff.sjv.io/c/6058776/1168108/14325",
    triggerWords: ["bike cleaner", "motorcycle cleaner", "car wash", "pressure washer", "vehicle maintenance", "cleaning supplies", "bike maintenance"]
  },
  {
    id: "1281667",
    name: "IPRoyal",
    product: "Proxy services for online privacy and security",
    description: "Access secure proxy solutions for enhanced online privacy and data protection with IPRoyal.",
    audience: "Individuals seeking proxy solutions for online privacy and security.",
    categories: ["Internet Service Provider", "Software"],
    trackingLink: "https://iproyal.sjv.io/c/6058776/1281667/15731",
    triggerWords: ["proxy", "security", "privacy", "online", "anonymous", "data protection", "internet security"]
  },
  {
    id: "1826593",
    name: "Godlike Host",
    product: "Web hosting and server solutions",
    description: "Get reliable web hosting services with high performance and excellent customer support from Godlike Host.",
    audience: "Individuals and businesses seeking web hosting solutions",
    categories: ["Internet Service Provider", "Hosting", "Software"],
    trackingLink: "https://godlikehost.sjv.io/c/6058776/1826593/21774",
    triggerWords: ["hosting", "website", "server", "domain", "service", "cloud", "performance", "web hosting"]
  },
  {
    id: "1917730",
    name: "Homestyler",
    product: "3D home design software",
    description: "Create professional 3D home designs easily with Homestyler's intuitive design platform.",
    audience: "Home design enthusiasts and DIY decorators",
    categories: ["Home", "Software", "Apps"],
    trackingLink: "https://homestyler.sjv.io/c/6058776/1917730/22993",
    triggerWords: ["design", "software", "3D", "home", "decor", "plan", "interior", "architecture"]
  },
  {
    id: "397623",
    name: "Wren AI",
    product: "GenBI AI-powered business intelligence platform",
    description: "Unlock the power of data without complexity using Wren AI's conversational GenBI platform and AI-powered spreadsheets.",
    audience: "Business teams, data analysts, executives, and marketers seeking simplified data insights",
    categories: ["Software", "AI Tools", "Business Intelligence", "Data Analytics"],
    trackingLink: "https://getwren.ai?via=397623",
    triggerWords: ["business intelligence", "data analytics", "GenBI", "AI analytics", "data visualization", "SQL", "spreadsheets", "dashboards", "data insights", "business data"],
    weight: 3.0
  }
];

// Create a mapping object for redirect service (id -> trackingLink)
const createRedirectMapping = (affiliatesData) => {
  return affiliatesData.reduce((acc, curr) => {
    acc[curr.id] = curr.trackingLink;
    return acc;
  }, {});
};

// Create the exports
const affiliatesData = affiliates;
const redirectMapping = createRedirectMapping(affiliates);

// Export for both CommonJS and ES modules
// This approach uses a trick to detect the module system at runtime
try {
  // CommonJS
  module.exports = {
    affiliatesData,
    redirectMapping
  };
} catch (e) {
  // ES modules - will be handled by the transpiler/bundler
}

// These exports will be used for ES modules but ignored in CommonJS
export { affiliatesData, redirectMapping };
export default affiliatesData;
