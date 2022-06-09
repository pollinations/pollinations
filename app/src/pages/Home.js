import Box from "@material-ui/core/Box"
import Debug from "debug"
import { textContent } from "../assets"
import MarkdownContent from "../components/molecules/MarkDownContent"
import Logo from '../components/Logo'

export default function Home() {

  return <>
    <Box 
      paddingTop={3} 
      display='flex' 
      flexDirection='column' 
      alignItems='center'>
      
      <Logo/>
      
      <Box
        display="grid"
        gridTemplateColumns="repeat(auto-fill, minmax(300px, 2fr))"
        gridGap="2em"
        minHeight="30vh"
        paddingTop="3em"
      >
        <div style={{ gridColumnStart: 1, gridColumnEnd: 3 }}>
          <MarkdownContent url={textContent.landingLeft} />
        </div>

        <MarkdownContent url={textContent.landingRight} />
      </Box>
    </Box>
  </>
}
