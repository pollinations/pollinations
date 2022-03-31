import {
  Box, Button, Modal, Paper,
} from '@material-ui/core';
import Markdown from 'markdown-to-jsx';
import React, { useEffect, useState } from 'react';

export default function SimpleModal() {
  const [open, setOpen] = useState(false);
  const [markdown, setMarkdown] = useState('*loading...*');

  useEffect(async () => {
    const response = await fetch('https://raw.githubusercontent.com/pollinations/pollinations/master/docs/instructions.md');
    const md = await response.text();
    setMarkdown(md);
  }, []);

  const modalStyle = {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'scroll',
    display: 'block',
    maxHeight: '90%',
    maxWidth: '800px',
    margin: 'auto',
  };
  // {display:'flex',alignItems:'center',justifyContent:'center',overflow: 'scroll'}}
  return (
    <>
      <Button type="button" color="secondary" onClick={() => setOpen(true)}>
        [ Instructions ]
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby="simple-modal-title"
        aria-describedby="simple-modal-description"
        style={modalStyle}
      >
        <Paper style={{ maxWidth: '90%' }} variant="outlined">
          {' '}
          <Box p={1}>
            <Markdown style={{ maxWidth: '600px' }}>{markdown}</Markdown>
          </Box>
        </Paper>
      </Modal>
    </>
  );
}
