import Link from '@material-ui/core/Link'
import RouterLink from "./molecules/RouterLink"



const Footer = () => <>
    <div style={{ margin: '1em auto 1em auto' }}>
        Discuss, get help and contribute on
        <Link href="https://github.com/pollinations/pollinations" target="_blank"> [ Github ] </Link>
        or <Link href="https://discord.gg/XXd99CrkCr" target="_blank">[ Discord ]</Link>.
        <br/>
    </div>
    <RouterLink to='/impressum' style={{marginTop: '0'}}>
        Impressum
    </RouterLink>
</>

export default Footer