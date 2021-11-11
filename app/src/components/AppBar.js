import React, { useEffect, useState } from 'react';
import AppBarMaterial from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import { SocialLinks } from './Social';
import { Link } from 'react-router-dom'


export default function AppBar({ children }) {

  return <>

    <AppBarMaterial position="static">
      <Toolbar variant="dense">

          <Typography variant="h6" noWrap>
            <Link to="/">Pollinations</Link>
          </Typography>

          <SocialLinks />
      </Toolbar>
    </AppBarMaterial>
  </>
}