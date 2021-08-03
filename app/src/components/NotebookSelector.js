import React, { useState } from 'react';
import Drawer from '@material-ui/core/Drawer';
import Button from '@material-ui/core/Button';
import List from '@material-ui/core/List';
import Divider from '@material-ui/core/Divider';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import WallpaperIcon from '@material-ui/icons/Wallpaper';
import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import MenuIcon from '@material-ui/icons/Menu';

import { noop } from '../network/utils';

const notebookList = [{
    name: "CLIP-guided VQGan",
    path: "/p/QmXJnK2FUHEDjR5aFLYELChU6JqdfSxNsoZpy1yHiMXNoK",
    category: "Text-to-Image",
    Icon: WallpaperIcon
},
{
    name: "CLIP-guided Diffusion",
    path: "/p/QmSeaCzpgm3BP1FgEEUXuW5bW7aYRhrbmemdpKENmdu1Yg",
    category: "Text-to-Image",
    Icon: WallpaperIcon
},
{
    name: "DALL-E Mini",
    path: "/p/QmQBzUpwF21ynVfSU3tW2WiWZfNjS94aq58verfghDLpWV",
    category: "Text-to-Image",
    Icon: WallpaperIcon
},
];

// guided diffusion /p/Qma1zZwTYTX5rKoGpyBY4DWCK7ERXGpto4pNKfmHAEFoVM

export default function NotebookSelector() {
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
            Pollinations
          </Typography>
        </Toolbar>
      </AppBar>
          <Drawer anchor={"top"} open={visible} onClose={() => setVisible(false)}>
          <List>
        {notebookList.map(({name, category, Icon, path}) => (
          <ListItem button key={name} component="a" href={path}>
            <ListItemIcon> <Icon /> </ListItemIcon>
            <ListItemText primary={`${category} - ${name}`} />
          </ListItem>
        ))}
      </List>
          </Drawer>
        </>
}