import React, { useEffect, useState } from 'react';
import Drawer from '@material-ui/core/Drawer';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import MenuIcon from '@material-ui/icons/Menu';

import { getNotebooks } from "../data/notebooks.js";
import { SocialLinks } from './Social';
import { Box } from '@material-ui/core';
import { Link } from 'react-router-dom'


export default function NotebookSelector({children}) {

  const [visible, setVisible] = useState(false)
  const [notebooks,setNotebooks] = useState([])
  useEffect(async () => setNotebooks(await getNotebooks()),[])

  return <>

    <AppBar position="static">
      <Toolbar variant="dense">

        <IconButton
          color="inherit"
          aria-label="open drawer"
          onClick={() => setVisible(true)}
          edge="start">

          <MenuIcon fontSize="small" />

        </IconButton>

        <Typography variant="h6" noWrap>
          <Link to="/">Pollinations</Link>
        </Typography>

        <Box marginLeft="15"> 
          <SocialLinks />
        </Box>

        {children}

      </Toolbar>
    </AppBar>

    <Drawer anchor={"top"} open={visible} onClose={() => setVisible(false)}>
      <List>
        {notebooks.map(({name, category, Icon, path}) => ( 
          <Link key={path} onClick={() => setVisible(false)} to={path}>
            <ListItem button key={name} component="a" >
            <ListItemIcon> <Icon /> </ListItemIcon>
            <ListItemText primary={`${category} - ${name}`} />
            </ListItem>
          </Link>
        ))}
      </List>
    </Drawer>
  </>
}