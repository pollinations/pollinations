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
    id: "2699274",
    name: "Talkpal - AI Language Learning",
    product: "Talkpal landscape banner for promoting AI communication services.",
    description: "Explore AI-based language learning and communication solutions with Talkpal.",
    audience: "Language learners and individuals looking to improve their communication skills through AI technology.",
    categories: ["Education", "Apps", "Language Learning"],
    tags: ["AI language learning", "language practice", "communication skills"],
    trackingLink: "https://talkpalinc.sjv.io/c/6058776/2699274/30644",
    triggerWords: ["language learning", "AI tutor", "practice speaking", "learn languages", "conversation practice", "language skills", "foreign language", "language app", "language tutor", "speaking practice"]
  },
  {
    id: "2774941",
    name: "HeyReal.AI",
    product: "AI Chatbot Platform",
    description: "Create and chat with diverse, realistic AI characters. Customize companions for engaging conversations.",
    audience: "Users interested in AI chatbots, virtual companions, and character interaction.",
    categories: ["AI Tools", "Chatbots", "Entertainment", "Social"],
    trackingLink: "https://go.sjv.io/c/6058776/2774941/30752",
    triggerWords: ["ai chatbot", "character ai", "virtual companion", "ai chat", "realistic ai", "custom ai character", "talk to ai"]
  },
  // {
  //   id: "lovemy",
  //   name: "LoveMy.ai",
  //   product: "An AI companion that offers personalized interactions and intimacy.",
  //   description: "Create your intimate AI companion on LoveMy.ai",
  //   audience: "Individuals seeking an intimate and personalized AI companionship experience.",
  //   categories: ["Sexual Wellness & Adult"],
  //   tags: ["ai companion", "nsfw", "adult"],
  //   nsfw: true,
  //   trackingLink: "https://lovemy.ai/?linkId=lp_060145&sourceId=pollinations&tenantId=lovemyai",
  //   triggerWords: ["AI companion", "virtual girlfriend", "digital companion", "AI relationship", "virtual partner", "AI chat", "romantic AI", "intimate AI", "personal AI", "virtual dating"]
  // },
  // {
  //   id: "hentai",
  //   name: "AIHentaiChat.com",
  //   product: "Uncensored AI chat services",
  //   description: "Explore uncensored AI chat on AIHentaiChat.com",
  //   audience: "Adults seeking uncensored AI chat experiences",
  //   categories: ["Sexual Wellness & Adult", "Apps"],
  //   tags: ["ai companion", "nsfw", "adult", "hentai"],
  //   nsfw: true,
  //   trackingLink: "https://aihentaichat.com/?linkId=lp_617069&sourceId=pollinations&tenantId=lovemyai",
  //   triggerWords: ["hentai", "anime", "manga", "adult content", "NSFW", "uncensored", "adult chat", "fantasy chat", "anime characters", "adult anime"]
  // },
  {
    id: "kofi",
    name: "Support Pollinations on Ko-fi",
    product: "Donation platform for creators.",
    description: "Support Pollinations AI with a donation on Ko-fi",
    audience: "Individuals looking to support creators and projects financially.",
    categories: ["Charitable Causes", "Apps"],
    tags: ["donation", "support"],
    ad_text: "Powered by Pollinations.AI free text APIs. [Support our mission]({url}) to keep AI accessible for everyone.",
    trackingLink: "https://ko-fi.com/pollinationsai",
    triggerWords: ["donation", "support creators", "creator support", "funding", "tip jar", "financial support", "creator economy", "patronage", "buy me a coffee", "contribute"]
  },
  {
    id: "25841",
    name: "Kodak Photo Printer",
    product: "Kodak 4PASS photo printers and instant cameras",
    description: "Get high-quality Kodak photo printers and instant cameras with 4PASS technology for superior photo quality.",
    audience: "Photography enthusiasts and consumers looking for high-quality photo printing solutions",
    categories: ["Consumer Electronics", "Photography"],
    tags: ["photo printer", "instant camera", "4PASS technology"],
    trackingLink: "https://primedigitalmarketing.pxf.io/jeQnEb",
    triggerWords: ["photo printer", "instant camera", "printing photos", "photo quality", "portable printer", "image printing", "digital prints", "instant printing", "photo paper", "photography equipment"]
  },
  {
    id: "200613",
    name: "SentryPC",
    product: "Parental control and monitoring software",
    description: "Monitor and manage your children's computer activities with SentryPC parental control software.",
    audience: "Parents concerned about their children's online activities and digital safety.",
    categories: ["Software", "Security", "Family & Parenting"],
    trackingLink: "https://sentrypc.7eer.net/c/6058776/200613/3022",
    triggerWords: ["parental control", "child monitoring", "screen time", "internet safety", "content filtering", "online protection", "cyber safety", "child safety", "computer monitoring", "digital parenting"]
  },
  {
    id: "511355",
    name: "Namecheap",
    product: "Domain registration and web hosting services",
    description: "Register domains and get reliable web hosting with Namecheap's affordable services.",
    audience: "Website owners, developers, and businesses looking for domain registration and hosting solutions.",
    categories: ["Web Services", "Internet Service Provider"],
    trackingLink: "https://namecheap.pxf.io/c/6058776/511355/5618",
    triggerWords: ["domain registration", "web hosting", "website domains", "domain names", "hosting services", "SSL certificates", "website hosting", "domain renewal", "DNS management", "website builder"]
  },
  {
    id: "1462842",
    name: "ExpressVPN",
    product: "VPN service for secure and private internet browsing",
    description: "Protect your online privacy and security with ExpressVPN's high-speed encrypted connections.",
    audience: "Privacy-conscious internet users seeking secure browsing and access to geo-restricted content.",
    categories: ["Software", "Internet Service Provider", "Security"],
    trackingLink: "https://go.expressvpn.com/c/6058776/1462842/16063",
    triggerWords: ["VPN", "online privacy", "secure browsing", "internet security", "geo-restriction", "IP masking", "encrypted connection", "anonymous browsing", "data protection", "streaming access"]
  },
  {
    id: "1830593",
    name: "Tidio LLC",
    product: "Live chat and chatbot software for websites",
    description: "Enhance customer support with Tidio's AI-powered live chat and chatbot solutions for your website.",
    audience: "Business owners and marketers looking to improve customer engagement and support on their websites.",
    categories: ["Software", "Business Services", "Customer Support"],
    trackingLink: "https://tidio.pxf.io/c/6058776/1830593/21771",
    triggerWords: ["live chat", "chatbot", "customer support", "website chat", "AI chatbot", "customer service", "support software", "chat widget", "conversational AI", "customer engagement"]
  },
  {
    id: "1099744",
    name: "Cowinaudio",
    product: "Noise-cancelling headphones and audio equipment",
    description: "Experience premium sound quality with Cowin's noise-cancelling headphones and audio products.",
    audience: "Audio enthusiasts and consumers looking for quality headphones and audio equipment.",
    categories: ["Consumer Electronics", "Audio Equipment"],
    trackingLink: "https://cowinaudio.pxf.io/c/6058776/1099744/13794",
    triggerWords: ["noise cancelling", "headphones", "wireless audio", "bluetooth headphones", "audio equipment", "sound quality", "over-ear headphones", "music listening", "audio devices", "premium sound"]
  },
  {
    id: "2848156",
    name: "Soundop Audio Workstation",
    product: "Professional audio editing software for Windows",
    description: "Edit and produce audio professionally with Soundop's efficient audio workstation software.",
    audience: "Audio professionals, music producers, and content creators needing powerful audio editing tools.",
    categories: ["Music & Audio", "Software", "Creative Tools"],
    trackingLink: "https://ivosight.sjv.io/c/6058776/2848156/14274",
    triggerWords: ["audio editor", "DAW", "audio workstation", "sound editing", "music production", "audio software", "recording software", "audio mixing", "sound design", "audio production"]
  },
  {
    id: "2882892",
    name: "Doodle",
    product: "Scheduling and calendar management software",
    description: "Simplify meeting scheduling and time management with Doodle's automated scheduling tools.",
    audience: "Professionals, teams, and businesses looking to streamline scheduling and appointment management.",
    categories: ["Software", "Business Services", "Productivity"],
    trackingLink: "https://impact.doodle.com/c/6058776/2882892/32965",
    triggerWords: ["scheduling", "calendar management", "appointment booking", "meeting planner", "time management", "team scheduling", "availability", "meeting coordination", "calendar sync", "productivity tool"]
  },
  {
    id: "242590",
    name: "Lenovo Hong Kong",
    product: "Lenovo computers and electronics",
    description: "Shop for Lenovo laptops, desktops, and accessories in Hong Kong.",
    audience: "Consumers and businesses in Hong Kong looking for computer hardware.",
    categories: ["Consumer Electronics", "Computers"],
    trackingLink: "https://lenovo.dgi7au.net/c/6058776/242590/4036",
    triggerWords: ["lenovo", "laptops", "desktops", "computer hardware", "electronics", "hong kong electronics", "pc", "computer deals"]
  },
  {
    id: "1166330",
    name: "Electronicx",
    product: "Car batteries and automotive electronics",
    description: "Purchase AGM car starter batteries and other automotive electronics from Electronicx.",
    audience: "Car owners needing replacement batteries or electronic parts.",
    categories: ["Automotive", "Electronics"],
    trackingLink: "https://electronicx.pxf.io/c/6058776/1166330/14483",
    triggerWords: ["car battery", "agm battery", "starter battery", "automotive electronics", "vehicle parts", "car maintenance"]
  },
  {
    id: "1168108",
    name: "Muc-Off",
    product: "Cleaning products for bikes and vehicles",
    description: "Get 15% off Muc-Off pressure washer bundles and other cleaning supplies.",
    audience: "Cyclists, motorcyclists, and car owners looking for cleaning and maintenance products.",
    categories: ["Automotive", "Cycling", "Cleaning Supplies"],
    trackingLink: "https://mucoff.sjv.io/c/6058776/1168108/14325",
    triggerWords: ["bike cleaner", "motorcycle cleaner", "car wash", "pressure washer", "vehicle maintenance", "cleaning supplies", "bike maintenance"]
  },
  {
    id: "1226538",
    name: "UPERFECT",
    product: "Portable monitors",
    description: "Discover UPERFECT portable monitors for gaming, work, and travel.",
    audience: "Gamers, professionals, and travelers needing an extra screen.",
    categories: ["Consumer Electronics", "Computer Accessories", "Monitors"],
    trackingLink: "https://uperfect.sjv.io/c/6058776/1226538/15155",
    triggerWords: ["portable monitor", "external display", "second screen", "travel monitor", "gaming monitor", "usb-c monitor"]
  },
  {
    id: "1228361",
    name: "Soulight",
    product: "Psychic and spiritual guidance services",
    description: "Connect with psychics for spiritual guidance and insights via Soulight.",
    audience: "Individuals seeking psychic readings, tarot, astrology, or spiritual advice.",
    categories: ["Services", "Spirituality", "Personal Development"],
    trackingLink: "https://bestpsychiclab.pxf.io/c/6058776/1228361/15175",
    triggerWords: ["psychic reading", "tarot reading", "astrology", "spiritual guidance", "fortune teller", "mediumship", "clairvoyant"]
  },
  {
    id: "1450763",
    name: "TurboTech Co.",
    product: "Tech gadgets and accessories",
    description: "Shop for various tech gadgets and accessories at TurboTech.co.",
    audience: "Tech enthusiasts looking for gadgets and accessories.",
    categories: ["Consumer Electronics", "Gadgets", "Accessories"],
    trackingLink: "https://turbotech.pxf.io/c/6058776/1450763/17212",
    triggerWords: ["tech gadgets", "electronics", "accessories", "gadget shop", "online tech store"]
  },
  {
    id: "1452075",
    name: "Printrendy",
    product: "Custom printed apparel and merchandise",
    description: "Design and order custom printed t-shirts, hoodies, and other merchandise on Printrendy.",
    audience: "Individuals and groups looking for custom apparel and print-on-demand items.",
    categories: ["Apparel", "Custom Printing", "Merchandise"],
    trackingLink: "https://printrendy.pxf.io/c/6058776/1452075/17020",
    triggerWords: ["custom t-shirts", "print on demand", "custom apparel", "personalized gifts", "merchandise printing"]
  },
  {
    id: "1453616",
    name: "Modlily",
    product: "Women's fashion and apparel",
    description: "Shop for trendy women's clothing, swimwear, and accessories at Modlily, featuring Halloween deals.",
    audience: "Women looking for affordable and stylish fashion items.",
    categories: ["Apparel", "Fashion", "Women's Clothing"],
    trackingLink: "https://modlily.sjv.io/c/6058776/1453616/17059",
    triggerWords: ["womens fashion", "online clothing store", "dresses", "swimwear", "affordable fashion", "fashion deals"]
  },
  {
    id: "1570637",
    name: "Happy Sinks Affiliate Program",
    product: "Kitchen cleaning tools and accessories",
    description: "Find stylish and functional kitchen cleaning tools and sink accessories from HAPPY SiNKS.",
    audience: "Homeowners looking for innovative and aesthetic kitchen cleaning solutions.",
    categories: ["Home Goods", "Kitchen", "Cleaning Supplies"],
    trackingLink: "https://happy-sinks.pxf.io/c/6058776/1570637/18086",
    triggerWords: ["kitchen cleaning", "sink accessories", "dish brush", "sponge holder", "kitchen organization", "home cleaning"]
  },
  {
    id: "1588112",
    name: "Puzzle Ready affiliate program",
    product: "Jigsaw puzzles and puzzle accessories",
    description: "Shop a wide variety of jigsaw puzzles and accessories at Puzzle Ready.",
    audience: "Jigsaw puzzle enthusiasts of all ages.",
    categories: ["Hobbies", "Games", "Toys"],
    trackingLink: "https://puzzle-ready.pxf.io/c/6058776/1588112/18069",
    triggerWords: ["jigsaw puzzles", "puzzles", "puzzle accessories", "hobby shop", "brain teasers", "family games"]
  },
  {
    id: "1588695",
    name: "Mioeco",
    product: "Eco-friendly home products",
    description: "Shop sustainable and eco-friendly home goods from Mioeco.",
    audience: "Environmentally conscious consumers looking for sustainable home products.",
    categories: ["Home Goods", "Sustainable Products", "Eco-Friendly"],
    trackingLink: "https://mioeco.sjv.io/c/6058776/1588695/18361",
    triggerWords: ["eco-friendly", "sustainable products", "reusable products", "zero waste", "bamboo products", "organic cotton"]
  },
  {
    id: "1598148",
    name: "Pure Scentum Affiliate Program",
    product: "Essential oils and aromatherapy products",
    description: "Discover high-quality essential oils and aromatherapy diffusers from Pure Scentum.",
    audience: "Individuals interested in aromatherapy, natural wellness, and essential oils.",
    categories: ["Health & Wellness", "Home Goods", "Beauty"],
    trackingLink: "https://pure-scentum.pxf.io/c/6058776/1598148/18531",
    triggerWords: ["essential oils", "aromatherapy", "diffuser", "natural wellness", "holistic health", "fragrance oils"]
  },
  {
    id: "1695270",
    name: "Casetify",
    product: "Customizable phone cases and tech accessories",
    description: "Design your own phone case or shop unique tech accessories at Casetify.",
    audience: "Consumers looking for stylish and protective phone cases and tech accessories.",
    categories: ["Consumer Electronics", "Accessories", "Fashion Tech"],
    trackingLink: "https://casetify.pxf.io/c/6058776/1695270/19793",
    triggerWords: ["phone case", "custom phone case", "tech accessories", "iphone case", "samsung case", "airpods case", "apple watch band"]
  },
  {
    id: "1749092",
    name: "Joyin Inc",
    product: "Toys, party supplies, and seasonal decorations",
    description: "Find toys, party supplies, Halloween costumes, and seasonal decorations at Joyin.",
    audience: "Parents, party planners, and individuals looking for toys and seasonal items.",
    categories: ["Toys", "Party Supplies", "Seasonal Decor", "Games"],
    trackingLink: "https://joyin.pxf.io/c/6058776/1749092/20090",
    triggerWords: ["toys", "party supplies", "halloween costumes", "christmas decorations", "kids toys", "birthday party"]
  },
  {
    id: "1780924",
    name: "Uncommon Goods",
    product: "Unique gifts and creative designs",
    description: "Discover unique gifts, home decor, and handmade items from independent artists at Uncommon Goods.",
    audience: "Gift shoppers looking for unique, creative, and often handmade items.",
    categories: ["Gifts", "Home Goods", "Handmade Products", "Art & Design"],
    trackingLink: "https://uncommongoods.sjv.io/c/6058776/1780924/20400",
    triggerWords: ["unique gifts", "creative gifts", "handmade gifts", "unusual gifts", "gifts for him", "gifts for her", "home decor"]
  },
  {
    id: "1878635",
    name: "Funwhole",
    product: "Building block sets with lighting kits",
    description: "Explore creative building block sets featuring integrated lighting kits from Funwhole.",
    audience: "Hobbyists, model builders, and fans of building blocks (like Lego) looking for unique sets.",
    categories: ["Toys", "Hobbies", "Models", "Collectibles"],
    trackingLink: "https://funwhole.pxf.io/c/6058776/1878635/22033",
    triggerWords: ["building blocks", "lego alternative", "model kits", "lighting kit", "hobby building", "creative toys"]
  },
  {
    id: "1900054",
    name: "Zno Affiliate Program",
    product: "Custom photo albums, books, and prints",
    description: "Create high-quality custom photo albums, flush mount albums, photo books, and prints with Zno.",
    audience: "Photographers (professional and amateur), families, individuals wanting to preserve memories.",
    categories: ["Photography", "Printing Services", "Gifts", "Personalized Products"],
    trackingLink: "https://zno.sjv.io/c/6058776/1900054/22294",
    triggerWords: ["photo album", "photo book", "custom album", "wedding album", "flush mount album", "photo prints", "photography products"]
  },
  {
    id: "1902997",
    name: "MindySupports",
    product: "Virtual assistant and customer support services",
    description: "Outsource customer support, back-office tasks, and sales support with virtual assistants from MindySupports.",
    audience: "Businesses looking for BPO, customer service, and virtual assistant solutions.",
    categories: ["Business Services", "Outsourcing", "Customer Support", "Virtual Assistant"],
    trackingLink: "https://mindysupports.pxf.io/c/6058776/1902997/22304",
    triggerWords: ["virtual assistant", "customer support outsourcing", "BPO", "back office support", "remote team", "business process outsourcing"]
  },
  {
    id: "1977347",
    name: "Hostinger",
    product: "Web hosting and domain registration services",
    description: "Get affordable and reliable web hosting, domain names, and website building tools from Hostinger.",
    audience: "Individuals, small businesses, and developers looking for web hosting solutions.",
    categories: ["Web Hosting", "Internet Service Provider", "Software", "Domains"],
    trackingLink: "https://hostinger.sjv.io/c/6058776/1977347/13095",
    triggerWords: ["web hosting", "domain registration", "website builder", "cheap hosting", "wordpress hosting", "vps hosting", "shared hosting"]
  },
  {
    id: "2077801",
    name: "iMyFone LockWiper (Android) Affiliate Program",
    product: "Android screen unlock software",
    description: "Unlock Android screen locks (PIN, pattern, password, fingerprint, face ID) without data loss using iMyFone LockWiper.",
    audience: "Android users who are locked out of their devices.",
    categories: ["Software", "Mobile Utilities", "Security"],
    trackingLink: "https://imyfone.sjv.io/c/6058776/2077801/9881",
    triggerWords: ["android unlock", "remove screen lock", "bypass android lock", "unlock phone password", "frp bypass", "mobile unlock tool"]
  },
  {
    id: "2080380",
    name: "Ssemble",
    product: "Online video editing platform",
    description: "Edit videos collaboratively online with Ssemble's cloud-based video editor.",
    audience: "Content creators, marketers, educators, and teams needing online video editing tools.",
    categories: ["Software", "Video Editing", "Creative Tools", "Collaboration"],
    trackingLink: "https://ssemble.sjv.io/c/6058776/2080380/24634",
    triggerWords: ["video editor", "online video editor", "collaborative video editing", "cloud video editor", "content creation", "video production"]
  },
  {
    id: "2170742",
    name: "Fotor",
    product: "Online photo editor and graphic design tool",
    description: "Edit photos, create designs, and make photo collages easily with Fotor's online tools.",
    audience: "Individuals, marketers, social media users needing easy photo editing and design capabilities.",
    categories: ["Software", "Photography", "Graphic Design", "Creative Tools"],
    trackingLink: "https://fotor.sjv.io/c/6058776/2170742/3842",
    triggerWords: ["photo editor", "online photo editor", "graphic design tool", "image editor", "collage maker", "design creator", "social media graphics"]
  },
  {
    id: "2171699",
    name: "Vevor Affiliate Program",
    product: "Industrial tools, equipment, and supplies",
    description: "Shop a wide range of tools, equipment, and supplies for various industries at Vevor.",
    audience: "Businesses, DIY enthusiasts, and professionals needing industrial and commercial equipment.",
    categories: ["Tools & Equipment", "Industrial Supplies", "Business", "Home Improvement"],
    trackingLink: "https://vevor.sjv.io/c/6058776/2171699/19058",
    triggerWords: ["tools", "equipment", "industrial supplies", "machinery", "restaurant equipment", "automotive tools", "DIY tools"]
  },
  {
    id: "2219458",
    name: "Vidnoz",
    product: "AI video creation platform",
    description: "Create AI-powered videos with realistic avatars and voiceovers using Vidnoz.",
    audience: "Marketers, educators, businesses, and content creators looking for AI video generation tools.",
    categories: ["Software", "AI Tools", "Video Editing", "Marketing Technology"],
    trackingLink: "https://vidnoz.sjv.io/c/6058776/2219458/25517",
    triggerWords: ["ai video generator", "video creation", "ai avatar", "text to video", "talking head video", "marketing video", "educational video"]
  },
  {
    id: "2229705",
    name: "Insta360 Affiliate Program",
    product: "360-degree cameras and action cameras",
    description: "Capture immersive photos and videos with Insta360's range of 360 and action cameras.",
    audience: "Videographers, photographers, travelers, adventurers, and content creators.",
    categories: ["Consumer Electronics", "Cameras", "Photography", "Videography"],
    trackingLink: "https://insta360.sjv.io/c/6058776/2229705/21158",
    triggerWords: ["360 camera", "action camera", "insta360", "vr camera", "panoramic camera", "adventure camera", "vlogging camera"]
  },
  {
    id: "1977348",
    name: "Hostinger Global",
    product: "Global web hosting and domain services",
    description: "Access Hostinger's web hosting, domain registration, and website tools available globally.",
    audience: "International users, businesses, and developers needing web hosting solutions.",
    categories: ["Web Hosting", "Internet Service Provider", "Software", "Domains"],
    trackingLink: "https://hostinger.sjv.io/c/6058776/1977348/13095?subId1=mar",
    triggerWords: ["global web hosting", "international hosting", "domain names", "website hosting", "wordpress hosting", "cloud hosting"]
  },
  {
    id: "2292292",
    name: "Wondershare Filmora",
    product: "Video editing software",
    description: "Edit videos easily with Wondershare Filmora's user-friendly interface and powerful features.",
    audience: "Beginner to intermediate video editors, content creators, social media users.",
    categories: ["Software", "Video Editing", "Creative Tools"],
    trackingLink: "https://wondershare.sjv.io/c/6058776/2292292/1 Wondershare Filmora", // Example link, confirm actual
    triggerWords: ["video editor", "filmora", "wondershare", "easy video editing", "video software", "content creation tool"]
  },
  {
    id: "2370355",
    name: "FlexiSpot ES",
    product: "Ergonomic office furniture (Spain)",
    description: "Shop for ergonomic standing desks, office chairs, and workspace solutions from FlexiSpot Spain.",
    audience: "Individuals and businesses in Spain looking for ergonomic office furniture.",
    categories: ["Furniture", "Office Supplies", "Ergonomics", "Home Office"],
    trackingLink: "https://flexispot.sjv.io/c/6058776/2370355/18915",
    triggerWords: ["standing desk", "ergonomic chair", "office furniture", "home office setup", "adjustable desk", "workspace solutions"]
  },
  {
    id: "2489179",
    name: "Kittl",
    product: "Graphic design platform with templates",
    description: "Create professional designs easily with Kittl's intuitive platform and vast template library.",
    audience: "Designers, marketers, creators, and businesses needing quick graphic design solutions.",
    categories: ["Software", "Graphic Design", "Creative Tools", "Marketing Technology"],
    trackingLink: "https://kittl.pxf.io/c/6058776/2489179/28494",
    triggerWords: ["graphic design", "design tool", "online design platform", "templates", "logo maker", "poster maker", "social media graphics"]
  },
  {
    id: "2495989",
    name: "Geekbuying",
    product: "Consumer electronics and gadgets",
    description: "Shop for a wide variety of consumer electronics, gadgets, drones, and smart home devices at Geekbuying.",
    audience: "Tech enthusiasts, gadget lovers, and consumers looking for deals on electronics.",
    categories: ["Consumer Electronics", "Gadgets", "E-commerce", "Smart Home"],
    trackingLink: "https://geekbuying.pxf.io/c/6058776/2495989/9766",
    triggerWords: ["electronics deals", "gadgets", "tech shop", "drones", "smart home devices", "consumer electronics", "online shopping"]
  },
  {
    id: "2700819",
    name: "Rowabi LLC",
    product: "Premium lighting and home decor",
    description: "Elevate your home with Rowabi’s premium lighting & decor. Shop stylish & sustainable designs.",
    audience: "Homeowners looking for stylish and sustainable lighting and decor.",
    categories: ["Home Goods", "Lighting", "Decor", "Furniture"],
    trackingLink: "https://rowabillc.pxf.io/c/6058776/2700819/30391",
    triggerWords: ["home lighting", "decor", "lamps", "chandeliers", "sustainable design", "home accents"]
  },
  {
    id: "2822847",
    name: "HONA CBD",
    product: "CBD performance gummies",
    description: "Get HONA Performance Gummies: The Ultimate Non-Stim Pre-Workout Boost.",
    audience: "Athletes and individuals looking for CBD-based performance supplements.",
    categories: ["Health & Wellness", "Supplements", "CBD", "Sports Nutrition"],
    trackingLink: "https://hona.sjv.io/c/6058776/2822847/30419",
    triggerWords: ["cbd gummies", "performance supplements", "pre-workout", "cbd for athletes", "natural supplements", "wellness"]
  },
  {
    id: "2823497",
    name: "oyrosy.com",
    product: "Fashion apparel and accessories",
    description: "Shop for fashion items, potentially themed for events like St. Patrick's Day, at oyrosy.com.",
    audience: "Consumers looking for trendy apparel and accessories.",
    categories: ["Apparel", "Fashion", "Accessories"],
    trackingLink: "https://oyrosycom.sjv.io/c/6058776/2823497/32511",
    triggerWords: ["fashion", "apparel", "online clothing", "accessories", "trendy clothes", "seasonal fashion"]
  },
  {
    id: "2902339",
    name: "Kodak Photo Printer",
    product: "Portable photo printers",
    description: "Get $10 OFF Kodak Mini 2 retro portable printer and Kodak Dock Plus retro printer.",
    audience: "Individuals wanting to print photos from their smartphones or devices.",
    categories: ["Consumer Electronics", "Printers", "Photography", "Gadgets"],
    trackingLink: "https://primedigitalmarketing.pxf.io/c/6058776/2902339/25841",
    triggerWords: ["photo printer", "portable printer", "kodak printer", "instant printer", "smartphone printer", "mini printer"]
  },
  {
    id: "RWzlAdv71NrOxT",
    name: "DreamGF",
    product: "AI companion service",
    description: "Create your own AI companion on DreamGF.",
    audience: "Individuals seeking personalized AI companionship experiences.",
    categories: ["AI", "Entertainment", "Digital Companions"],
    trackingLink: "https://dreamgf.ai/?a=RWzlAdv71NrOxT",
    triggerWords: ["ai companion", "virtual girlfriend", "ai chat", "digital companion", "ai character", "virtual relationship", "ai interaction"]
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
