import React from 'react'
import { Link } from '@material-ui/core'
import { SOCIAL_LINKS } from '../_globalConfig/socialLinks'
import styled from '@emotion/styled'
import { Colors, MOBILE_BREAKPOINT } from '../styles/global'


export const SocialLinks = ({ small, hideOnMobile, gap }) => (
  <SocialStyle small={small} hideOnMobile={hideOnMobile} gap={gap}>
    {
    Object.keys(SOCIAL_LINKS).map(platform => 
        <Link
          key={`plt_link_${SOCIAL_LINKS[platform]?.url}`}
          href={SOCIAL_LINKS[platform]?.url}
          target="_blank"
          title={platform}
        >
          <IconImg src={SOCIAL_LINKS[platform]?.icon_img} small={small} />
        </Link>
      )
    }
  </SocialStyle>
)

const IconImg = styled.img`
width: ${props => props.small ? '14px' : '22px'};
height: auto;
`

const SocialStyle = styled.div`
grid-area: social;
align-self: center;
display: flex;
justify-content: flex-end;
align-items: center;

gap: ${props => props.gap || '0em'};
a {
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  border: ${props => props.small ? '0.75px' : '1px'} solid ${props => props.small ? 'white' : Colors.lime};
  width: ${props => props.small ? '30px' : '47px'} !important;
  height: ${props => props.small ? '30px' : '47px'} !important;
}
@media only screen and (max-width: ${MOBILE_BREAKPOINT}){
  display: ${props => props.hideOnMobile ? 'none' : ''};
}
`

const PlatformLink = (platform) => {
  const { icon_img, url } = SOCIAL_LINKS[platform]
  return (
    <Link
      key={`plt_link_${platform}`}
      href={url}
      style={{ 
        borderRadius: '50%',
        border: `1px solid ${Colors.lime}`,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
      target="_blank"
      title={platform}
    >
      <IconImg src={icon_img} small={small} />
    </Link>
  )
}