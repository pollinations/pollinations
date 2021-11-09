import { Box, Link } from "@material-ui/core"
import { SocialLinks } from "./Social"

let FooterProps = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontStyle: 'italic',
    width: '90%',
    margin: 'auto'
}

const More = () => <div>
        Discuss, get help and contribute on 
        <Link href="https://github.com/pollinations/pollinations/discussions" target="_blank">[ Github ]</Link> 
        or <Link href="https://discord.gg/XXd99CrkCr" target="_blank">[ Discord ]</Link>.
</div>


const Footer = () => <>

<Box {...FooterProps}>  
    <SocialLinks/>  
    <More/>
</Box>

</>

export default Footer