export const ROUTES = {
    about: { label: "About", to: "/about", id: 'about' },
    feed: { label: "Feed", to: "/feed", id: 'feed' },
    help: { label: "Help", to: "/help", id: 'help' },
    impressum: { label: "impressum", to: "/impressum", id: 'impressum' },
    models: { label: "Create", to: '/c', id: 'create' },
    // integrate: { label: "integrate", to: "/integrate" },
    // myPollens: { label: "my pollens", to: "/localpollens" },
    // expo: { children: "made with pollinations", to: "/expo" },
  }
export const MAIN_NAV_ROUTES = [
    ROUTES.models,
    ROUTES.about, 
    ROUTES.feed,
    ROUTES.help
]
export const MARKDOWN_ROUTES = [
    ROUTES.about,
    ROUTES.help,
    ROUTES.impressum
]