import { Box, Button, Paper } from '@material-ui/core';
import Markdown from 'markdown-to-jsx';
import React, { useEffect, useState } from 'react';

export default function SimpleModal() {
  const [open, setOpen] = useState(true);
  const [markdown, setMarkdown] = useState('*loading...*');

  useEffect(async () => {
    const response = await fetch('https://raw.githubusercontent.com/pollinations/pollinations/master/docs/instructions.md');
    const md = await response.text();
    setMarkdown(md);
  }, []);
  if (!open) return null;
  return (
    <Paper style={{ maxWidth: '90%' }} variant="outlined">
      {' '}
      <Box p={1}>
        <Markdown>{markdown}</Markdown>
      </Box>
      <Button onClick={() => setOpen(false)}>Close</Button>
    </Paper>

  );
}
