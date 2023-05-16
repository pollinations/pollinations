export const ROUTES = {
    // about: { label: "About", to: "/about", id: 'about' },
    // integrate: { label: "Integrate", to: "/integrate", id: 'integrate' },
    // feed: { label: "Feed", to: "/feed", id: 'feed' },
    // help: { label: "Help", to: "/help", id: 'help' },
    impressum: { label: "impressum", to: "/impressum", id: 'impressum' },
    // explore: { label: "Explore", to: '/c', id: 'explore' },
    // integrate: { label: "integrate", to: "/integrate" },
    // myPollens: { label: "my pollens", to: "/localpollens" },
    // expo: { children: "made with pollinations", to: "/expo" },
  }
export const MAIN_NAV_ROUTES = [
    // ROUTES.explore,
    // ROUTES.integrate,
    // ROUTES.about, 
    // ROUTES.feed,
    // ROUTES.help
]
export const MARKDOWN_ROUTES = [
    // ROUTES.about,
    // ROUTES.integrate,
    // ROUTES.help,
    ROUTES.impressum
]

export const USER_NAV_ROUTES = [
    { label: 'Usage', to: '/d/usage', id: 'usage' },
    { label: 'API Token', to: 'd/api_token', id: 'api_token' }
  ]