import {
    Button, TextField 
} from "@material-ui/core";
import styled from '@emotion/styled'
import { BackGroundImage } from "../styles/global";
import whyBG from '../assets/imgs/BG7.png'

export default function SimpleForm(props){

const { fields, err, title, onSubmit } = props;

return <Style>
    <ListStyle style={{width: 300}}>
        <h2 children={title} style={{ margin: 0 }} />
        <form onSubmit={onSubmit}>
            {
                fields.map( field => <TextField {...field}/> )
            }
            {err && <ErrorFeedback children={err.message}/>}
            <Button children='Submit' type='submit'/>
        </form>
    </ListStyle>
    <BackGroundImage 
    src={whyBG} 
    top='auto'
    zIndex='-1' 
    objectPosition='0 30%'
    alt="hero_bg_overlay" />
</Style>
}


const SuccessFeedback = styled.p`
color: lime;
`

const ErrorFeedback = styled.p`
max-width: 300px;
color: red;
`
const ListStyle = styled.div`
display: flex;
flex-direction: column;
gap: 1em;

form {
    display: flex;
    flex-direction: column;
    gap: 1em;
}
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
