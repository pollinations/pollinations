import * as React from 'react';
import styled from '@emotion/styled';
import Drawer from '@material-ui/core/Drawer';

export default function TemporaryDrawer({ drawerState, children }) {
  const [state, setState] = drawerState;

  const toggleDrawer = (open) => (event) => {
    if (event.type === 'keydown' && (event.key === 'Tab' || event.key === 'Shift')) {
      return;
    }
    setState(open);
  };

  return <Drawer anchor='right' open={state} onClose={toggleDrawer(false)}>
      <DrawerContainer onClick={toggleDrawer(false)} onKeyDown={toggleDrawer(false)}>
        {children}
      </DrawerContainer>
  </Drawer>
};

const DrawerContainer = styled.div`
width: 100%;
height: 100%;
min-width: 77vw;
background-color: black;
z-index: 5;
`;

