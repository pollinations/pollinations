import {
  Avatar,
  Button,
  Dialog, DialogActions,
  DialogTitle,
  List,
  ListItem,
  ListItemAvatar, ListItemText,
} from '@material-ui/core';

import { useAuth } from '../../hooks/useAuth';

export default function LoginDialog({ state }) {
  const [isOpen, setOpen] = state;
  const { loginProviders, handleSignIn } = useAuth();

  return (
    <Dialog open={isOpen}>

      <DialogTitle>Login</DialogTitle>
      <List style={{ minWidth: 300 }}>
        {loginProviders?.map((provider) => (
          <ListItem button onClick={() => handleSignIn(provider)} key={provider}>
            <ListItemAvatar>
              <Avatar src={`/socials/${provider}_white.png`} />
            </ListItemAvatar>
            <ListItemText primary={provider} />
          </ListItem>
        ))}
      </List>
      <DialogActions>
        <Button onClick={() => setOpen((state) => !state)}> [ Close ]</Button>
      </DialogActions>
    </Dialog>
  );
}
