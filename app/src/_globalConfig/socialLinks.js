import { ICONS } from '../assets/icons'
import DiscordLogo from '../assets/icons/discord.png'
import YoutubeLogo from '../assets/icons/youtube.png'
import InstagramLogo from '../assets/icons/instagram.png'
import TwitterLogo from '../assets/icons/twitter.png'
import GithubLogo from '../assets/icons/github.png'

export const SOCIAL_LINKS = {
  discord: {
    label: 'Discord',
    icon: ICONS.discord,
    icon_img: DiscordLogo,
    url: 'https://discord.gg/8HqSRhJVxn',
  },
  github: {
    label: 'GitHub',
    icon: ICONS.github,
    icon_img: GithubLogo,
    url: 'https://www.github.com/pollinations'
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
}
