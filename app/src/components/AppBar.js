import { Box, Container, Link } from '@material-ui/core'
import AppBarMaterial from '@material-ui/core/AppBar'
import Toolbar from '@material-ui/core/Toolbar'
import Typography from '@material-ui/core/Typography'
import Alert from '@material-ui/lab/Alert'
import React from 'react'
import { Route, Routes } from 'react-router'
import RouterLink from './molecules/RouterLink'
import { SocialLinks } from './Social'

export default function AppBar() {

  return <>
      <Container maxWidth='lg'>

      <div style={Border}/>

      <div style={ContainerStyle}>
        <Box minWidth='50%' display='grid' gridRowGap='2em' gridTemplateColumns='repeat(auto-fit, minmax(90px, 1fr))'>

          <Typography variant="h6" style={{ gridColumnStart: 1, gridColumnEnd: 3}}>
              <RouterLink to={"/"}>
                pollinations.ai
              </RouterLink>
          </Typography>
          <Typography variant="h6">
              <RouterLink to={"/about"}>
                about
              </RouterLink>
          </Typography>
          <Typography variant="h6">
              <RouterLink to={"/help"}>
                help
              </RouterLink>
          </Typography>
          <Typography variant="h6">
              <RouterLink to={"/feed"}>
                feed
              </RouterLink>
          </Typography>

        </Box>

        <SocialLinks />
      </div>
      {/* <Alert severity="error">
       Sorry, we are experiencing some problems with our backend. We are on it and pollinations will be back as soon as possible
      </Alert> */}
      </Container>
      </>
}

let ContainerStyle = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start'
}
let Border = {
  width: '100%',
  height: '1px',
  marginTop: '1.5em',
  backgroundColor: 'white',
}

