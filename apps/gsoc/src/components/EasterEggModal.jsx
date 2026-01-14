import React from 'react';
import { Dialog, DialogContent, Box, Typography, IconButton } from '@mui/material';
import { Close } from '@mui/icons-material';
import { motion } from 'framer-motion';

const easterEggMessages = [
  {
    title: "🎉 You Found It!",
    message: "Welcome to the secret realm of GSOC 2026! Keep pushing the boundaries and exploring the web. You're already thinking like a true pollinator!",
    emoji: "🐝"
  },
  {
    title: "✨ Easter Egg Unlocked!",
    message: "Great detective work! This hidden message is just a small token of appreciation for your curiosity. Keep that spirit when contributing to GSOC 2026!",
    emoji: "🔓"
  },
  {
    title: "🚀 Secret Achievement!",
    message: "You've discovered the pollinations.ai easter egg! This is what we love - curiosity and exploration. Apply that same energy to your GSOC projects!",
    emoji: "🎯"
  },
  {
    title: "💎 Hidden Gem Found!",
    message: "Congratulations! You're part of an exclusive club of explorers. Remember, the best discoveries come from curiosity and persistence.",
    emoji: "✨"
  }
];

const EasterEggModal = ({ open, onClose }) => {
  const message = easterEggMessages[Math.floor(Math.random() * easterEggMessages.length)];

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(96, 165, 250, 0.3)',
          borderRadius: '20px',
          boxShadow: '0 8px 32px rgba(96, 165, 250, 0.3)',
          overflow: 'hidden'
        }
      }}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, type: 'spring' }}
      >
        <DialogContent sx={{ p: 4, position: 'relative' }}>
          <IconButton
            onClick={onClose}
            sx={{
              position: 'absolute',
              right: 12,
              top: 12,
              color: 'rgba(255,255,255,0.6)',
              '&:hover': {
                color: '#fff',
                backgroundColor: 'rgba(255,255,255,0.1)'
              }
            }}
          >
            <Close />
          </IconButton>

          <Box sx={{ textAlign: 'center', mt: 2 }}>
            <motion.div
              animate={{ 
                scale: [1, 1.1, 1],
                rotate: [0, 10, -10, 0]
              }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ fontSize: '3rem', marginBottom: '1rem' }}
            >
              {message.emoji}
            </motion.div>

            <Typography 
              variant="h4" 
              sx={{ 
                fontWeight: 700, 
                mb: 2,
                background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontSize: '1.8rem'
              }}
            >
              {message.title}
            </Typography>

            <Typography 
              variant="body1" 
              sx={{ 
                color: 'rgba(255,255,255,0.85)',
                lineHeight: 1.8,
                fontSize: '1.05rem',
                mb: 2
              }}
            >
              {message.message}
            </Typography>

            <Box
              sx={{
                mt: 3,
                p: 2,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                fontSize: '0.85rem',
                color: 'rgba(255,255,255,0.7)'
              }}
            >
              💡 Hint: This easter egg appears randomly. Try clicking the logo 3 times!
            </Box>
          </Box>
        </DialogContent>
      </motion.div>
    </Dialog>
  );
};

export default EasterEggModal;
