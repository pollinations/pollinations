import { Container, Link } from '@material-ui/core'
import AppBarMaterial from '@material-ui/core/AppBar'
import Toolbar from '@material-ui/core/Toolbar'
import Typography from '@material-ui/core/Typography'
import Alert from '@material-ui/lab/Alert'
import React from 'react'
import RouterLink from './molecules/RouterLink'
import { SocialLinks } from './Social'

export default function AppBar() {

  return <>
      <Container maxWidth='lg'>

          <div style={Border}/>
      <div style={ContainerStyle}>
        <Typography variant="h6">
          <RouterLink to={"/"}>
            about
          </RouterLink>
        </Typography>

        <SocialLinks />
      </div>
      </Container>
      </>
}

let ContainerStyle = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
}
let Border = {
  width: '100%',
  height: '1px',
  marginTop: '1.5em',
  backgroundColor: 'white',
}

