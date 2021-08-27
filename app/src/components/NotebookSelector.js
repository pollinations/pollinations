import React, { useState } from 'react';
import Drawer from '@material-ui/core/Drawer';
import Button from '@material-ui/core/Button';
import List from '@material-ui/core/List';
import Divider from '@material-ui/core/Divider';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import MenuIcon from '@material-ui/icons/Menu';

import { noop } from '../network/utils';

import { notebooks } from "../data/notebooks.js";
import NodeStatus from './NodeStatus';
import { SocialLinks } from './Social';

export default function NotebookSelector(state) {
    const [visible, setVisible] = useState(false);
    
    return <>
         <AppBar
        position="static"
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            onClick={() => setVisible(true)}
            edge="start"
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap>
            Pollinations&nbsp;
          </Typography>
          <SocialLinks />
          <NodeStatus {...state} />
        </Toolbar>
      </AppBar>
          <Drawer anchor={"top"} open={visible} onClose={() => setVisible(false)}>
          <List>
        {notebooks.map(({name, category, Icon, path}) => (
          <ListItem button key={name} component="a" href={path}>
            <ListItemIcon> <Icon /> </ListItemIcon>
            <ListItemText primary={`${category} - ${name}`} />
          </ListItem>
        ))}
      </List>
          </Drawer>
        </>
}