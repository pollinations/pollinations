import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, TextField, IconButton, Paper, Avatar, Chip, Button, Container, Stack, Card, CardContent, Fade, Zoom, CircularProgress, Tooltip } from '@mui/material';
import { Send, AutoAwesome, Clear, LightbulbOutlined, RocketLaunchOutlined, SchoolOutlined, CodeOutlined } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import socBotAPI from '../api/socBot';

const ChatMessage = ({ message, isBot, timestamp, isTyping }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3 }}
      style={{
        display: 'flex',
        justifyContent: isBot ? 'flex-start' : 'flex-end',
        marginBottom: '1rem',
        alignItems: 'flex-start',
        gap: '12px'
      }}
    >
      {isBot && (
        <Box sx={{ position: 'relative' }}>
          <Avatar 
            src="/polli_white.svg" 
            sx={{ 
              width: 40, 
              height: 40, 
              bgcolor: 'rgba(96, 165, 250, 0.1)',
              border: '2px solid rgba(96, 165, 250, 0.3)',
              position: 'relative'
            }}
          />
          <Avatar
            src="/gsoc_logo.webp"
            sx={{
              width: 18,
              height: 18,
              position: 'absolute',
              bottom: -2,
              right: -2,
              border: '2px solid #09090b',
              bgcolor: '#fff'
            }}
          />
        </Box>
      )}
      
      <Box
        sx={{
          maxWidth: '70%',
          minWidth: isTyping ? '100px' : 'auto'
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 2,
            background: isBot 
              ? 'linear-gradient(135deg, rgba(96, 165, 250, 0.1) 0%, rgba(96, 165, 250, 0.05) 100%)'
              : 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.08) 100%)',
            border: `1px solid ${isBot ? 'rgba(96, 165, 250, 0.2)' : 'rgba(255,255,255,0.2)'}`,
            borderRadius: isBot ? '20px 20px 20px 8px' : '20px 20px 8px 20px',
            backdropFilter: 'blur(20px)',
            color: '#fff',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {isBot && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '2px',
                background: 'linear-gradient(90deg, #60a5fa, #3b82f6)',
                opacity: 0.6
              }}
            />
          )}
          
          {isTyping ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} sx={{ color: '#60a5fa' }} />
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                socBot is thinking...
              </Typography>
            </Box>
          ) : (
            <Typography 
              variant="body1" 
              sx={{ 
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                fontSize: '0.95rem'
              }}
            >
              {message}
            </Typography>
          )}
          
          {timestamp && !isTyping && (
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'rgba(255,255,255,0.5)',
                display: 'block',
                textAlign: 'right',
                mt: 1,
                fontSize: '0.7rem'
              }}
            >
              {new Date(timestamp).toLocaleTimeString()}
            </Typography>
          )}
        </Paper>
      </Box>

      {!isBot && (
        <Avatar 
          src="/gsoc_logo.webp" 
          sx={{ 
            width: 40, 
            height: 40, 
            bgcolor: 'rgba(255,255,255,0.1)',
            border: '2px solid rgba(255,255,255,0.2)'
          }}
        />
      )}
    </motion.div>
  );
};

const SuggestedQuestion = ({ question, onClick, icon }) => (
  <motion.div
    whileHover={{ scale: 1.02, y: -2 }}
    whileTap={{ scale: 0.98 }}
  >
    <Card
      onClick={() => onClick(question)}
      elevation={0}
      sx={{
        cursor: 'pointer',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        transition: 'all 0.3s ease',
        '&:hover': {
          borderColor: 'rgba(96, 165, 250, 0.4)',
          background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.1) 0%, rgba(96, 165, 250, 0.05) 100%)',
          boxShadow: '0 8px 32px rgba(96, 165, 250, 0.2)'
        }
      }}
    >
      <CardContent sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ color: '#60a5fa', fontSize: '1.2rem' }}>
            {icon}
          </Box>
          <Typography 
            variant="body2" 
            sx={{ 
              color: 'rgba(255,255,255,0.9)',
              fontWeight: 500,
              lineHeight: 1.4
            }}
          >
            {question}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  </motion.div>
);

const socBotChat = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef(null);
  const pollyAPI = useRef(new socBotAPI());

  useEffect(() => {
    document.title = "socBot - AI Assistant | GSOC 2026 | pollinations.ai";
    
    // Welcome message
    setMessages([{
      id: 1,
      content: "Hello! I'm socBot, your AI assistant for Google Summer of Code 2026 at pollinations.ai! 🚀\n\nI'm here to help you with everything related to GSOC - from understanding the program to choosing projects, application guidance, and technical support.\n\nWhat would you like to know about GSOC 2026?",
      isBot: true,
      timestamp: new Date().toISOString()
    }]);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async (messageText = inputValue) => {
    if (!messageText.trim()) return;

    const userMessage = {
      id: Date.now(),
      content: messageText,
      isBot: false,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setShowSuggestions(false);
    setIsLoading(true);

    // Add typing indicator
    const typingMessage = {
      id: Date.now() + 1,
      content: '',
      isBot: true,
      isTyping: true
    };
    setMessages(prev => [...prev, typingMessage]);

    try {
      const response = await pollyAPI.current.sendMessage(messageText);
      
      // Remove typing indicator and add actual response
      setMessages(prev => {
        const withoutTyping = prev.filter(msg => !msg.isTyping);
        return [...withoutTyping, {
          id: Date.now() + 2,
          content: response.message,
          isBot: true,
          timestamp: response.timestamp
        }];
      });
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => {
        const withoutTyping = prev.filter(msg => !msg.isTyping);
        return [...withoutTyping, {
          id: Date.now() + 2,
          content: "I apologize, but I'm experiencing some technical difficulties. Please try again or check our FAQ and documentation pages for immediate help.",
          isBot: true,
          timestamp: new Date().toISOString()
        }];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setMessages([{
      id: 1,
      content: "Chat cleared! How can I help you with GSOC 2026?",
      isBot: true,
      timestamp: new Date().toISOString()
    }]);
    pollyAPI.current.clearHistory();
    setShowSuggestions(true);
  };

  const suggestedQuestions = pollyAPI.current.getSuggestedQuestions();
  const questionIcons = [
    <LightbulbOutlined />,
    <RocketLaunchOutlined />,
    <SchoolOutlined />,
    <CodeOutlined />,
    <LightbulbOutlined />,
    <SchoolOutlined />,
    <CodeOutlined />,
    <RocketLaunchOutlined />
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#09090b', position: 'relative', overflow: 'hidden' }}>
      {/* Background Effects */}
      <Box 
        sx={{
          position: 'absolute',
          top: '-10%',
          right: '-5%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(96, 165, 250, 0.1) 0%, rgba(0,0,0,0) 70%)',
          zIndex: 0,
          pointerEvents: 'none'
        }} 
      />
      <Box 
        sx={{
          position: 'absolute',
          bottom: '-10%',
          left: '-5%',
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, rgba(0,0,0,0) 70%)',
          zIndex: 0,
          pointerEvents: 'none'
        }} 
      />

      <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1, py: 4, height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Box sx={{ textAlign: 'center', mb: 4, mt: 6 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mb: 2 }}>
              <Avatar 
                src="/polli_white.svg" 
                sx={{ 
                  width: 60, 
                  height: 60,
                  bgcolor: 'rgba(96, 165, 250, 0.1)',
                  border: '3px solid rgba(96, 165, 250, 0.3)',
                  position: 'relative'
                }}
              />
              <Box>
                <Typography 
                  variant='h4' 
                  sx={{ 
                    fontWeight: 700, 
                    background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)', 
                    WebkitBackgroundClip: 'text', 
                    WebkitTextFillColor: 'transparent',
                    lineHeight: 1
                  }}
                >
                  socBot
                </Typography>
                <Typography variant="subtitle1" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                  Your GSOC 2026 AI Assistant
                </Typography>
              </Box>
            </Box>
            
            <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 2 }}>
              <Chip 
                label="AI Powered" 
                size="small" 
                icon={<AutoAwesome />}
                sx={{ 
                  bgcolor: 'rgba(96, 165, 250, 0.15)', 
                  color: '#60a5fa',
                  border: '1px solid rgba(96, 165, 250, 0.3)'
                }} 
              />
              <Chip 
                label="GSOC Expert" 
                size="small" 
                sx={{ 
                  bgcolor: 'rgba(34, 197, 94, 0.15)', 
                  color: '#22c55e',
                  border: '1px solid rgba(34, 197, 94, 0.3)'
                }} 
              />
              <Chip 
                label="24/7 Available" 
                size="small" 
                sx={{ 
                  bgcolor: 'rgba(245, 158, 11, 0.15)', 
                  color: '#f59e0b',
                  border: '1px solid rgba(245, 158, 11, 0.3)'
                }} 
              />
            </Stack>
          </Box>
        </motion.div>

        {/* Chat Messages Area */}
        <Box 
          sx={{ 
            flex: 1, 
            overflowY: 'auto', 
            mb: 3,
            px: 1,
            '&::-webkit-scrollbar': {
              width: '6px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '10px',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'rgba(96, 165, 250, 0.3)',
              borderRadius: '10px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: 'rgba(96, 165, 250, 0.5)',
            },
          }}
        >
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message.content}
              isBot={message.isBot}
              timestamp={message.timestamp}
              isTyping={message.isTyping}
            />
          ))}
          
          {/* Suggested Questions */}
          <AnimatePresence>
            {showSuggestions && messages.length === 1 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                <Box sx={{ mt: 3 }}>
                  <Typography 
                    variant="subtitle2" 
                    sx={{ 
                      color: 'rgba(255,255,255,0.6)', 
                      textAlign: 'center', 
                      mb: 2,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      fontWeight: 600
                    }}
                  >
                    Suggested Questions
                  </Typography>
                  <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                    {suggestedQuestions.slice(0, 6).map((question, index) => (
                      <SuggestedQuestion
                        key={index}
                        question={question}
                        icon={questionIcons[index]}
                        onClick={handleSendMessage}
                      />
                    ))}
                  </Box>
                </Box>
              </motion.div>
            )}
          </AnimatePresence>
          
          <div ref={messagesEndRef} />
        </Box>

        {/* Input Area */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <Paper 
            elevation={0}
            sx={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '25px',
              p: 1
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
              <TextField
                fullWidth
                multiline
                maxRows={3}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything about GSOC 2026..."
                variant="standard"
                disabled={isLoading}
                InputProps={{
                  disableUnderline: true,
                }}
                sx={{
                  '& .MuiInputBase-input': {
                    color: '#fff',
                    fontSize: '1rem',
                    px: 2,
                    py: 1.5,
                    '&::placeholder': {
                      color: 'rgba(255,255,255,0.5)',
                    },
                  },
                }}
              />
              
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="Clear Chat">
                  <IconButton
                    onClick={clearChat}
                    disabled={isLoading}
                    sx={{
                      color: 'rgba(255,255,255,0.6)',
                      '&:hover': {
                        color: '#ef4444',
                        bgcolor: 'rgba(239, 68, 68, 0.1)'
                      }
                    }}
                  >
                    <Clear />
                  </IconButton>
                </Tooltip>
                
                <Tooltip title="Send Message">
                  <IconButton
                    onClick={() => handleSendMessage()}
                    disabled={isLoading || !inputValue.trim()}
                    sx={{
                      bgcolor: 'rgba(96, 165, 250, 0.15)',
                      color: '#60a5fa',
                      border: '1px solid rgba(96, 165, 250, 0.3)',
                      '&:hover': {
                        bgcolor: 'rgba(96, 165, 250, 0.25)',
                        transform: 'scale(1.05)'
                      },
                      '&:disabled': {
                        bgcolor: 'rgba(255,255,255,0.05)',
                        color: 'rgba(255,255,255,0.3)'
                      },
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {isLoading ? (
                      <CircularProgress size={20} sx={{ color: 'rgba(96, 165, 250, 0.6)' }} />
                    ) : (
                      <Send />
                    )}
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          </Paper>
        </motion.div>
      </Container>
    </Box>
  );
};

export default socBotChat;
