import React from 'react'
import { Link } from '@material-ui/core'
import { SOCIAL_LINKS } from '../_globalConfig/socialLinks'
import styled from '@emotion/styled'
import { Colors, MOBILE_BREAKPOINT } from '../styles/global'


export const SocialLinks = ({ small, hideOnMobile, gap, invert }) => (
  <SocialStyle small={small} hideOnMobile={hideOnMobile} gap={gap} invert={invert}>
    {
    Object.keys(SOCIAL_LINKS).map(platform => 
        <Link
          key={`plt_link_${SOCIAL_LINKS[platform]?.url}`}
          href={SOCIAL_LINKS[platform]?.url}
          target="_blank"
          title={platform}
        >
          <IconImg src={SOCIAL_LINKS[platform]?.icon_img} small={small} invert={invert} />
        </Link>
      )
    }
  </SocialStyle>
)

const IconImg = styled.img`
width: ${props => props.small ? '16px' : '24px'};
height: auto;
${props => props.invert ? 'filter:invert(100%)' : ''};
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
  border: ${props => props.small ? '0.75px' : '1px'} solid ${props => props.small ? props.invert ? 'black' : 'white' : Colors.offwhite};
  width: ${props => props.small ? '30px' : '47px'} !important;
  height: ${props => props.small ? '30px' : '47px'} !important;
  transition: background-color 0.3s, filter 0.3s;
  &:hover {
    background-color: ${props => props.small ? "black" : Colors.offwhite};
    img {
      filter: ${props => props.small ? 'none' : 'invert(100%)'};
    }
  }
}
@media only screen and (max-width: ${MOBILE_BREAKPOINT}){
  display: ${props => props.hideOnMobile ? 'none' : ''};
}
`
