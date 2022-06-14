import Box from "@material-ui/core/Box"
import Debug from "debug"
import { textContent } from "../assets"
import MarkdownContent from "../components/molecules/MarkDownContent"
import Logo from '../components/Logo'
import PageTemplate from "../components/PageTemplate"
import { StartHereButton } from "../components/molecules/LaunchColabButton"
import { Button } from "@material-ui/core"
import { useNavigate } from "react-router-dom"

export default function Home() {

  const navigate = useNavigate()

  return <>
    <Box 
      paddingTop={3} 
      display='flex' 
      flexDirection='column' 
      alignItems='center'>
      
      <Logo/>
      
      <Box
        display="flex"
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        // gridTemplateColumns="repeat(auto-fill, minmax(300px, 2fr))"
        gridGap="2em"
        minHeight="calc(100vh - 350px)"
        maxHeight="100vh"
        padding="3em 0"
        marginBottom='2em'
      >
        <MarkdownContent url={textContent.landingLeft} />
        <Button 
            style={{marginTop: '1em'}}
            variant='outlined'
            onClick={()=> navigate('/c')}
            color="primary"  
            target="colab">
            Create
        </Button>

      </Box>

      <PageTemplate label='landing' />

    </Box>
  </>
}
