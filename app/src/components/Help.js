import React, { useEffect, useState } from "react";

import Markdown from 'markdown-to-jsx';
import { Paper, Modal, Button, Box } from "@material-ui/core";

export default function SimpleModal() {

    const [open, setOpen] = useState(false);
    const [markdown, setMarkdown] = useState("*loading...*");
  
    useEffect(async () => {
        const response = await fetch("https://raw.githubusercontent.com/voodoohop/pollinations/dev/docs/instructions.md");
        const md = await response.text();
        setMarkdown(md);
    },[]);

    return (
        <>
        <Button type="button" onClick={() => setOpen(true)}>
          [ Help ]
        </Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          aria-labelledby="simple-modal-title"
          aria-describedby="simple-modal-description"
          style={{display:'flex',alignItems:'center',justifyContent:'center'}}
        >
            <Paper style={{maxWidth:"80%"}}> <Box p={1}>
                <Markdown>{markdown}</Markdown>
                </Box>
            </Paper>
        </Modal>
        </>
    );
  }