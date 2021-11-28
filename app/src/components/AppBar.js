import { Link } from '@material-ui/core'
import AppBarMaterial from '@material-ui/core/AppBar'
import Toolbar from '@material-ui/core/Toolbar'
import Typography from '@material-ui/core/Typography'
import Alert from '@material-ui/lab/Alert'
import React from 'react'
import RouterLink from './molecules/RouterLink'
import { SocialLinks } from './Social'

export default function AppBar({ children }) {

  return <>
    <AppBarMaterial position="static">
      <Toolbar variant="dense">

        <Typography variant="h6" noWrap>
          <RouterLink to={"/"}>
            Pollinations
          </RouterLink>
        </Typography>

        <SocialLinks />
      </Toolbar>
    </AppBarMaterial>
    <Alert severity="info">This is the <b>new experimental</b> frontend to Pollinations.AI. To visit the old one go to <Link href="https://old.pollinations.ai">https://old.pollinations.ai</Link> </Alert>
  </>
}


