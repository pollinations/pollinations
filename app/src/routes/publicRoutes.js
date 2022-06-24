export const ROUTES = {
    about: { label: "about", to: "/about" },
    feed: { label: "feed", to: "/feed" },
    help: { label: "help", to: "/help" },
    impressum: { label: "impressum", to: "/impressum" },
    models: { label: "create", to: '/c' },
    // integrate: { label: "integrate", to: "/integrate" },
    // myPollens: { label: "my pollens", to: "/localpollens" },
    // expo: { children: "made with pollinations", to: "/expo" },
  }
export const MAIN_NAV_ROUTES = [
    ROUTES.models,
    ROUTES.about, 
    ROUTES.feed,
    ROUTES.help, 
    // ROUTES.integrate, 
    // ROUTES.myPollens
]
export const MARKDOWN_ROUTES = [
    ROUTES.about,
    ROUTES.help,
    ROUTES.impressum,
    // ROUTES.integrate
]