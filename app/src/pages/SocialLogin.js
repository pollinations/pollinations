import {
    Avatar, 
    Button, 
    Dialog, DialogActions,
    DialogTitle,
    List,
    ListItem,
    ListItemAvatar, ListItemText, TextField 
} from "@material-ui/core";
import styled from '@emotion/styled'
import { useAuth } from '../hooks/useAuth'
import { BackGroundImage, BaseContainer } from "../styles/global";
import whyBG from '../assets/imgs/BG7.png'

export default function LoginPage({ state }){

const { loginProviders, handleSignIn } = useAuth()

return <Style>
    <ListStyle style={{minWidth: 300}}>
        {loginProviders?.map((provider) => (
            <ListItem button onClick={() => handleSignIn(provider)} key={provider} style={{borderRadius: 5}}>
                <ListItemAvatar>
                    <Avatar src={`/socials/${provider}_white.png`}/>
                </ListItemAvatar>
                <p children={provider}/>
            </ListItem>
        ))}
    <TextField />
    <TextField />
    <Button/>
    </ListStyle>
    <BackGroundImage 
    src={whyBG} 
    top='auto'
    zIndex='-1' 
    objectPosition='0 30%'
    alt="hero_bg_overlay" />
</Style>
}
const ListStyle = styled.ul`
padding: 2em;
background: linear-gradient(90.41deg, rgba(255, 255, 255, 0.17) 1.53%, rgba(255, 255, 255, 0.1) 98.72%);
box-shadow: 0px 4px 24px -1px rgba(0, 0, 0, 0.17);
backdrop-filter: blur(15px);
/* Note: backdrop-filter has minimal browser support */
border-radius: 20px;
`
const Style = styled.div`
width: 100%;
min-height: 100vh;
padding: 0em;
margin: 0;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
`;
