import React, { useEffect, useState } from "react";

import Markdown from 'markdown-to-jsx';
import { Paper, Modal, Button, Box } from "@material-ui/core";

export default function SimpleModal() {

    const [open, setOpen] = useState(true);
    const [markdown, setMarkdown] = useState("*loading...*");
    
    useEffect(async () => {
        const response = await fetch("https://raw.githubusercontent.com/pollinations/pollinations/dev/docs/instructions.md");
        const md = await response.text();
        setMarkdown(md);
    },[]);
    if (!open)
      return null;
    return (<Paper style={{maxWidth:"90%"}} variant="outlined"> <Box p={1}>
                <Markdown>{markdown}</Markdown>
              </Box>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </Paper>

    );
  }