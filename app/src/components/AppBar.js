import React, { useEffect, useState } from 'react';
import AppBarMaterial from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import { SocialLinks } from './Social';

import Alert from '@material-ui/lab/Alert';
import { Link as MaterialLink } from '@material-ui/core';
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
    <Alert severity="info">This is the <b>new experimental</b> frontend to Pollinations.AI. To visit the old one go to <MaterialLink href="https://old.pollinations.ai">https://old.pollinations.ai</MaterialLink> </Alert>
  </>
}