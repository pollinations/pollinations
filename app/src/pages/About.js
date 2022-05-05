import MarkDownContent from "../components/molecules/MarkDownContent"
import { SmallContainer } from "./styles/base"
import RouterLink from "../components/molecules/RouterLink"

const About = () => {

    return <SmallContainer>
        <MarkDownContent id='about'/>

        <RouterLink to='/impressum' style={{marginTop: '0'}}>
            Impressum
        </RouterLink>
    </SmallContainer>
}

export default About