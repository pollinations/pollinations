export const ROUTES = {
    about: { label: "About", to: "/about", id: 'about' },
    integrate: { label: "Integrate", to: "/integrate", id: 'integrate' },
    feed: { label: "Feed", to: "/feed", id: 'feed' },
    help: { label: "Help", to: "/help", id: 'help' },
    impressum: { label: "impressum", to: "/impressum", id: 'impressum' },
    models: { label: "Create", to: '/c', id: 'create' },
    privacyPolicy: { label: "Privacy Policy", to: "/privacy-policy", id: 'privacyPolicy' },
    // integrate: { label: "integrate", to: "/integrate" },
    // myPollens: { label: "my pollens", to: "/localpollens" },
    // expo: { children: "made with pollinations", to: "/expo" },
  }
export const MAIN_NAV_ROUTES = [
    ROUTES.models,
    ROUTES.about, 
    ROUTES.integrate,
    ROUTES.feed,
    ROUTES.help
]
export const MARKDOWN_ROUTES = [
    // ROUTES.about,
    // ROUTES.integrate,
    ROUTES.help,
    ROUTES.impressum,
    ROUTES.privacyPolicy
]