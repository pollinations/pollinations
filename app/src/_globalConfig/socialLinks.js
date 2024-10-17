import { ICONS } from '../assets/icons'
import DiscordLogo from '../assets/icons/discord.png'
import YoutubeLogo from '../assets/icons/youtube.png'
import InstagramLogo from '../assets/icons/instagram.png'
import TwitterLogo from '../assets/icons/twitter.png'
import GithubLogo from '../assets/icons/github.png'
import TikTokLogo from '../assets/icons/tiktok.png'
import BuyMeACoffeeLogo from '../assets/icons/buymeacoffee.png' // P91e9

export const SOCIAL_LINKS = {
  discord: {
    label: 'Discord',
    icon: ICONS.discord,
    icon_img: DiscordLogo,
    url: 'https://discord.gg/k9F7SyTgqn',
  },
  github: {
    label: 'GitHub',
    icon: ICONS.github,
    icon_img: GithubLogo,
    url: 'https://www.github.com/pollinations/pollinations'
  },
  youtube: {
    label: 'YouTube',
    icon: ICONS.youtube,
    icon_img: YoutubeLogo,
    url: 'https://www.youtube.com/channel/UCk4yKnLnYfyUmCCbDzOZOug'
  },
  instagram: {
    label: 'Instagram',
    icon: ICONS.instagram,
    icon_img: InstagramLogo,
    url: 'https://instagram.com/pollinations_ai'
  },
  twitter: {
    label: 'Twitter',
    icon: ICONS.twitter,
    icon_img: TwitterLogo,
    url: 'https://twitter.com/pollinations_ai'
  },
  tiktok: {
    label: 'Tiktok',
    icon: ICONS.tiktok,
    icon_img: TikTokLogo,
    url: 'https://tiktok.com/@pollinations.ai'
  },
  buymecoffee: { // P91e9
    label: 'BuyMeACoffee', // P91e9
    icon: ICONS.buymeacoffee, // P91e9
    icon_img: BuyMeACoffeeLogo, // P91e9
    url: 'https://buymeacoffee.com/pollinations' // P91e9
  }
}
