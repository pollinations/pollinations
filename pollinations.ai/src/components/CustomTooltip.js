import { withStyles } from '@mui/styles';
import Tooltip from '@mui/material/Tooltip';

export const CustomTooltip = withStyles({
  tooltip: {
    // Your custom styles here
    fontSize: '1em',
    backgroundColor: '#333',
    color: '#fff',
  },
  popper: {
    transitionDelay: '500ms', // Appear after fixed mouse on top
  },
})(Tooltip);