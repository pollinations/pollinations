import React from 'react';
import { Typography, Link } from '@material-ui/core';
import { Colors } from '../../../styles/global';

export function ModelInfo({ model }) {
    if (model === "turbo") {
        return (
            <Typography variant="caption" color="textSecondary" style={{ marginTop: '10px', textAlign: 'center', fontSize: '1rem' }}>
                Model: <Link href="https://civitai.com/models/413466/boltning-realistic-lightning-hyper" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>Boltning</Link>
                &nbsp;&nbsp;
                LoRA: <Link href="https://huggingface.co/tianweiy/DMD2" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>DMD2</Link>
                &nbsp;&nbsp;
                Prompt Enhancer: <Link href="https://github.com/pollinations/pollinations/blob/master/image_gen_server/groqPimp.js" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>Groq</Link>
            </Typography>
        );
    }

    if (model === "flux") {
        return (
            <Typography variant="caption" color="textSecondary" style={{ marginTop: '10px', textAlign: 'center', fontSize: '1rem' }}>
                Model: <Link href="https://blackforestlabs.ai/" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>Flux.Schnell</Link>
                &nbsp;&nbsp;
                Prompt Enhancer: <Link href="https://github.com/pollinations/pollinations/blob/master/image_gen_server/groqPimp.js" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>Groq</Link>
            </Typography>
        );
    }

    return null;
}