import React from 'react';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { CustomTooltip } from './CustomTooltip';
import { Colors } from './../styles/global';

export function FeedEditSwitch({ toggleValue, handleToggleChange, isLoading }) {
  return (
    <ToggleButtonGroup
      value={toggleValue}
      variant="outlined"
      exclusive
      onChange={handleToggleChange}
      aria-label="Feed or Edit"
      style={{ height: '56px', border: `0.1px solid ${Colors.lime}` }}
    >
      <CustomTooltip title="Activate real-time generated image feed.">
        <ToggleButton
          value="feed"
          disabled={isLoading}
          style={{
            backgroundColor: toggleValue === 'feed' ? Colors.lime : 'transparent',
            color: toggleValue === 'feed' ? Colors.offblack : Colors.lime,
            fontSize: '1.3rem',
            fontFamily: 'Uncut-Sans-Variable',
            fontStyle: 'normal',
            fontWeight: 400,
            height: '100%',
            width: '100px',
            border: `1px solid ${Colors.lime}`,
          }}
        >
          Feed
        </ToggleButton>
      </CustomTooltip>
      <CustomTooltip title="Create an alternative image, this will freeze the feed when enabled.">
        <ToggleButton
          value="edit"
          disabled={isLoading}
          style={{
            backgroundColor: toggleValue === 'edit' ? Colors.lime : 'transparent',
            color: toggleValue === 'edit' ? Colors.offblack : Colors.lime,
            fontSize: '1.3rem',
            fontFamily: 'Uncut-Sans-Variable',
            fontStyle: 'normal',
            fontWeight: 400,
            height: '100%',
            width: '100px',
            border: `1px solid ${Colors.lime}`,
          }}
        >
          Edit
        </ToggleButton>
      </CustomTooltip>
    </ToggleButtonGroup>
  );
}