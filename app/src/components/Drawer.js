import { Box, Button, Divider, Drawer, List, ListItem, ListItemIcon, ListItemText } from '@material-ui/core';
import * as React from 'react';

export default function TemporaryDrawer({ drawerState, children }) {
  const [state, setState] = drawerState;

  const toggleDrawer = (open) => (event) => {
    if (event.type === 'keydown' && (event.key === 'Tab' || event.key === 'Shift')) {
      return;
    }

    setState(open);
  };

  return (
    <div>
        
        <Drawer anchor='top' open={state} onClose={toggleDrawer('top', false)}>
            <Box
            zIndex={5}
            sx={{ width: 'auto' }}
            role="presentation"
            onClick={toggleDrawer(false)}
            onKeyDown={toggleDrawer(false)}
            >
                {children}
            </Box>
        </Drawer>
          
    </div>
  );
}


