import Link from '@material-ui/core/Link'
import styled from '@emotion/styled'
import { SocialLinks } from './Social'
import { GlobalSidePadding } from '../styles/global'

const Footer = () => <FooterStyle>
    <div>
    Discuss, get help and contribute on
    <Link href="https://github.com/pollinations/pollinations" target="_blank"> [ Github ] </Link>
    or <Link href="https://discord.gg/XXd99CrkCr" target="_blank">[ Discord ]</Link>.
    </div>
    <SocialLinks/>
</FooterStyle>

export default Footer


const FooterStyle = styled.div`

width: 100%;
display: flex;
justify-content: space-between;
align-items: center;

padding: ${GlobalSidePadding};
margin: 1em 0;
`