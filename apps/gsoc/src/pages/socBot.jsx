import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, TextField, IconButton, Paper, Avatar, Chip, Button, Container, Stack, Card, CardContent, Fade, Zoom, CircularProgress, Tooltip, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import { Send, AutoAwesome, Clear, LightbulbOutlined, RocketLaunchOutlined, SchoolOutlined, CodeOutlined, ExpandMore } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import socBotAPI from '../api/socBot.ts';
import faqData from '../info/faq.json';

const MarkdownComponents = {
  h1: ({ children }) => (
    <Typography variant="h4" sx={{ fontWeight: 700, mb: 2, color: '#60a5fa', borderBottom: '2px solid rgba(96, 165, 250, 0.3)', pb: 1 }}>
      {children}
    </Typography>
  ),
  h2: ({ children }) => (
    <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 3, color: '#60a5fa' }}>
      {children}
    </Typography>
  ),
  h3: ({ children }) => (
    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5, mt: 2, color: '#22c55e' }}>
      {children}
    </Typography>
  ),
  h4: ({ children }) => (
    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1, mt: 2, color: '#f59e0b' }}>
      {children}
    </Typography>
  ),
  p: ({ children }) => (
    <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.6, color: 'rgba(255,255,255,0.9)' }}>
      {children}
    </Typography>
  ),
  ul: ({ children }) => (
    <Box component="ul" sx={{ pl: 3, mb: 2, '& li': { mb: 0.5 } }}>
      {children}
    </Box>
  ),
  ol: ({ children }) => (
    <Box component="ol" sx={{ pl: 3, mb: 2, '& li': { mb: 0.5 } }}>
      {children}
    </Box>
  ),
  li: ({ children }) => (
    <Typography component="li" variant="body1" sx={{ color: 'rgba(255,255,255,0.9)', lineHeight: 1.6 }}>
      {children}
    </Typography>
  ),
  code: ({ node, inline, className, children, ...props }) => {
    if (inline) {
      return (
        <Box 
          component="code" 
          sx={{ 
            bgcolor: 'rgba(96, 165, 250, 0.1)', 
            color: '#60a5fa', 
            px: 1, 
            py: 0.5, 
            borderRadius: '4px', 
            fontSize: '0.875rem',
            fontFamily: 'monospace'
          }}
          {...props}
        >
          {children}
        </Box>
      );
    }
    return (
      <Paper
        elevation={0}
        sx={{
          bgcolor: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(96, 165, 250, 0.2)',
          borderRadius: '8px',
          overflow: 'hidden',
          mb: 2
        }}
      >
        <Box
          component="pre"
          sx={{
            p: 2,
            overflow: 'auto',
            fontSize: '0.875rem',
            fontFamily: 'monospace',
            '& code': {
              color: '#e5e7eb !important',
              background: 'transparent !important'
            }
          }}
        >
          <code className={className} {...props}>
            {children}
          </code>
        </Box>
      </Paper>
    );
  },
  blockquote: ({ children }) => (
    <Paper
      elevation={0}
      sx={{
        bgcolor: 'rgba(34, 197, 94, 0.05)',
        border: '1px solid rgba(34, 197, 94, 0.2)',
        borderLeft: '4px solid #22c55e',
        borderRadius: '0 8px 8px 0',
        p: 2,
        mb: 2,
        fontStyle: 'italic'
      }}
    >
      {children}
    </Paper>
  ),
  a: ({ children, href }) => (
    <Box
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      sx={{
        color: '#60a5fa',
        textDecoration: 'underline',
        '&:hover': {
          color: '#3b82f6',
          textDecoration: 'none'
        }
      }}
    >
      {children}
    </Box>
  ),
  strong: ({ children }) => (
    <Box component="strong" sx={{ fontWeight: 700, color: '#fff' }}>
      {children}
    </Box>
  ),
  em: ({ children }) => (
    <Box component="em" sx={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.9)' }}>
      {children}
    </Box>
  ),
  hr: () => (
    <Box
      sx={{
        height: '1px',
        bgcolor: 'rgba(96, 165, 250, 0.3)',
        border: 'none',
        my: 3
      }}
    />
  ),
  table: ({ children }) => (
    <Paper
      elevation={0}
      sx={{
        bgcolor: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        overflow: 'hidden',
        mb: 2
      }}
    >
      <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
        {children}
      </Box>
    </Paper>
  ),
  th: ({ children }) => (
    <Box
      component="th"
      sx={{
        p: 1.5,
        bgcolor: 'rgba(96, 165, 250, 0.1)',
        borderBottom: '1px solid rgba(96, 165, 250, 0.3)',
        color: '#60a5fa',
        fontWeight: 600,
        textAlign: 'left'
      }}
    >
      {children}
    </Box>
  ),
  td: ({ children }) => (
    <Box
      component="td"
      sx={{
        p: 1.5,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.9)'
      }}
    >
      {children}
    </Box>
  )
};

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
              position: 'relative',
              px: 1,
              py: 1,
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
                SocBot is thinking...
              </Typography>
            </Box>
          ) : (
            <>
              {isBot ? (
                <ReactMarkdown
                  components={MarkdownComponents}
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  sx={{
                    '& > *:last-child': { mb: 0 },
                    '& > *:first-of-type': { mt: 0 }
                  }}
                >
                  {message}
                </ReactMarkdown>
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
            </>
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
  const [expandedFaq, setExpandedFaq] = useState(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const pollyAPI = useRef(new socBotAPI());

  // Group FAQ by category
  const faqByCategory = faqData.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {});

  useEffect(() => {
    document.title = "socBot - AI Assistant | GSOC 2026 | pollinations.ai";
    setMessages([{
      id: 1,
      content: "Hello! I'm socBot, your AI assistant for Google Summer of Code 2026 at pollinations.ai! 🚀\n\nI'm here to help you with everything related to GSOC - from understanding the program to choosing projects, application guidance, and technical support.\n\nWhat would you like to know about GSOC 2026?",
      isBot: true,
      timestamp: new Date().toISOString()
    }]);
  }, []);

  useEffect(() => {
    if (messages.length > 1) {
      scrollToBottom();
    }
  }, [messages]);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (messagesContainerRef.current) {
        const container = messagesContainerRef.current;
        const isScrolledNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
        if (isScrolledNearBottom || messages.length <= 1) {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
          });
        }
      }
    }, 100);
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
    setIsLoading(true);

    const typingMessage = {
      id: Date.now() + 1,
      content: '',
      isBot: true,
      isTyping: true
    };
    setMessages(prev => [...prev, typingMessage]);

    try {
      const response = await pollyAPI.current.sendMessage(messageText);
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
  };

  const handleFaqClick = async (question) => {
    await handleSendMessage(question);
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

  const categoryColors = {
    'General': '#60a5fa',
    'Application': '#3b82f6',
    'Projects': '#10b981',
    'Timeline': '#f59e0b',
    'Mentorship': '#8b5cf6',
    'Technical': '#ec4899',
    'Community': '#06b6d4',
    'Contribution': '#22c55e',
    'Selection': '#f59e0b',
    'Support': '#60a5fa',
    'Post-GSOC': '#a78bfa',
    'Troubleshooting': '#ef4444'
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#09090b', position: 'relative', overflow: 'hidden' }}>
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

      <Container maxWidth="md" sx={{ position: 'relative', mt: 1, zIndex: 1, py: 4, height: '90vh', display: 'flex', flexDirection: 'column' }}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
        </motion.div>
        <Box 
          ref={messagesContainerRef}
          sx={{ 
            flex: 1, 
            overflowY: 'auto', 
            mb: 3,
            px: 1,
            scrollBehavior: 'smooth',
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
          <AnimatePresence>
            {messages.length === 1 && (
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
                      mb: 3,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      fontWeight: 600
                    }}
                  >
                    Frequently Asked Questions
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {Object.entries(faqByCategory).map(([category, questions]) => (
                      <Box key={category}>
                        <Typography 
                          variant="caption" 
                          sx={{ 
                            color: categoryColors[category] || '#60a5fa',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            fontWeight: 700,
                            mb: 1.5,
                            display: 'block'
                          }}
                        >
                          {category}
                        </Typography>
                        {questions.map((faq) => (
                          <motion.div
                            key={faq.id}
                            whileHover={{ x: 4 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <Card
                              onClick={() => handleFaqClick(faq.question)}
                              elevation={0}
                              sx={{
                                cursor: 'pointer',
                                background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                                border: `1px solid ${categoryColors[category] ? categoryColors[category] + '30' : 'rgba(255,255,255,0.1)'}`,
                                borderRadius: '12px',
                                transition: 'all 0.3s ease',
                                mb: 1.5,
                                '&:hover': {
                                  borderColor: categoryColors[category] || '#60a5fa',
                                  background: `linear-gradient(135deg, ${categoryColors[category] || '#60a5fa'}15 0%, ${categoryColors[category] || '#60a5fa'}08 100%)`,
                                  boxShadow: `0 8px 32px ${categoryColors[category] || '#60a5fa'}30`,
                                  transform: 'translateY(-2px)'
                                }
                              }}
                            >
                              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    color: 'rgba(255,255,255,0.85)',
                                    fontWeight: 500,
                                    lineHeight: 1.4,
                                    fontSize: '0.9rem'
                                  }}
                                >
                                  {faq.question}
                                </Typography>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </Box>
                    ))}
                  </Box>
                </Box>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </Box>
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
