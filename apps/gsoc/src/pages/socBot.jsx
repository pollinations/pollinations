import {
    ArrowUpwardRounded,
    CodeOutlined,
    LightbulbOutlined,
    RocketLaunchOutlined,
    SchoolOutlined,
} from "@mui/icons-material";
import {
    Avatar,
    Box,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Container,
    IconButton,
    Paper,
    TextField,
    Typography,
} from "@mui/material";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/github-dark.css";
import socBotAPI from "../api/socBot.ts";
import { colors } from "../theme";
import { parseFaq } from "../utils/parseFaq";

const MarkdownComponents = {
    h1: ({ children }) => (
        <Typography
            variant="h4"
            sx={{
                fontWeight: 700,
                mb: 2,
                color: colors.lime.main,
                borderBottom: `2px solid ${colors.lime.border}`,
                pb: 1,
            }}
        >
            {children}
        </Typography>
    ),
    h2: ({ children }) => (
        <Typography
            variant="h5"
            sx={{ fontWeight: 600, mb: 2, mt: 3, color: colors.lime.main }}
        >
            {children}
        </Typography>
    ),
    h3: ({ children }) => (
        <Typography
            variant="h6"
            sx={{ fontWeight: 600, mb: 1.5, mt: 2, color: "#22c55e" }}
        >
            {children}
        </Typography>
    ),
    h4: ({ children }) => (
        <Typography
            variant="subtitle1"
            sx={{ fontWeight: 600, mb: 1, mt: 2, color: "#f59e0b" }}
        >
            {children}
        </Typography>
    ),
    p: ({ children }) => (
        <Typography
            variant="body1"
            sx={{ mb: 2, lineHeight: 1.6, color: "rgba(255,255,255,0.9)" }}
        >
            {children}
        </Typography>
    ),
    ul: ({ children }) => (
        <Box component="ul" sx={{ pl: 3, mb: 2, "& li": { mb: 0.5 } }}>
            {children}
        </Box>
    ),
    ol: ({ children }) => (
        <Box component="ol" sx={{ pl: 3, mb: 2, "& li": { mb: 0.5 } }}>
            {children}
        </Box>
    ),
    li: ({ children }) => (
        <Typography
            component="li"
            variant="body1"
            sx={{ color: "rgba(255,255,255,0.9)", lineHeight: 1.6 }}
        >
            {children}
        </Typography>
    ),
    code: ({ node, inline, className, children, ...props }) => {
        if (inline) {
            return (
                <Box
                    component="code"
                    sx={{
                        bgcolor: colors.lime.dim,
                        color: colors.lime.main,
                        px: 1,
                        py: 0.5,
                        borderRadius: "4px",
                        fontSize: "0.875rem",
                        fontFamily: "monospace",
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
                    bgcolor: "rgba(0,0,0,0.3)",
                    border: `1px solid ${colors.lime.border}`,
                    borderRadius: "8px",
                    overflow: "hidden",
                    mb: 2,
                }}
            >
                <Box
                    component="pre"
                    sx={{
                        p: 2,
                        overflow: "auto",
                        fontSize: "0.875rem",
                        fontFamily: "monospace",
                        "& code": {
                            color: "#e5e7eb !important",
                            background: "transparent !important",
                        },
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
                bgcolor: "rgba(34, 197, 94, 0.05)",
                border: "1px solid rgba(34, 197, 94, 0.2)",
                borderLeft: "4px solid #22c55e",
                borderRadius: "0 8px 8px 0",
                p: 2,
                mb: 2,
                fontStyle: "italic",
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
                color: colors.lime.main,
                textDecoration: "underline",
                "&:hover": {
                    color: colors.lime.light,
                    textDecoration: "none",
                },
            }}
        >
            {children}
        </Box>
    ),
    strong: ({ children }) => (
        <Box component="strong" sx={{ fontWeight: 700, color: "#fff" }}>
            {children}
        </Box>
    ),
    em: ({ children }) => (
        <Box
            component="em"
            sx={{ fontStyle: "italic", color: "rgba(255,255,255,0.9)" }}
        >
            {children}
        </Box>
    ),
    hr: () => (
        <Box
            sx={{
                height: "1px",
                bgcolor: colors.lime.border,
                border: "none",
                my: 3,
            }}
        />
    ),
    table: ({ children }) => (
        <Paper
            elevation={0}
            sx={{
                bgcolor: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                overflow: "hidden",
                mb: 2,
            }}
        >
            <Box
                component="table"
                sx={{ width: "100%", borderCollapse: "collapse" }}
            >
                {children}
            </Box>
        </Paper>
    ),
    th: ({ children }) => (
        <Box
            component="th"
            sx={{
                p: 1.5,
                bgcolor: colors.lime.dim,
                borderBottom: `1px solid ${colors.lime.border}`,
                color: colors.lime.main,
                fontWeight: 600,
                textAlign: "left",
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
                borderBottom: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.9)",
            }}
        >
            {children}
        </Box>
    ),
};

const ChatMessage = ({ message, isBot, timestamp, isTyping }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3 }}
            style={{
                display: "flex",
                justifyContent: isBot ? "flex-start" : "flex-end",
                marginBottom: "1rem",
                alignItems: "flex-start",
                gap: "12px",
            }}
        >
            {isBot && (
                <Box sx={{ position: "relative" }}>
                    <Avatar
                        src="/polli_white.svg"
                        sx={{
                            width: 40,
                            height: 40,
                            bgcolor: "transparent",
                            border: `2px solid ${colors.border.light}`,
                            position: "relative",
                            px: 1,
                            py: 1,
                        }}
                    />
                </Box>
            )}
            <Box
                sx={{
                    maxWidth: "70%",
                    minWidth: isTyping ? "100px" : "auto",
                }}
            >
                <Paper
                    elevation={0}
                    sx={{
                        p: 2,
                        background: isBot
                            ? "linear-gradient(135deg, rgba(163, 230, 53, 0.1) 0%, rgba(163, 230, 53, 0.05) 100%)"
                            : "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.08) 100%)",
                        border: `1px solid ${isBot ? colors.lime.dim : "rgba(255,255,255,0.2)"}`,
                        borderRadius: isBot
                            ? "20px 20px 20px 8px"
                            : "20px 20px 8px 20px",
                        backdropFilter: "blur(20px)",
                        color: "#fff",
                        position: "relative",
                        overflow: "hidden",
                    }}
                >
                    {isBot && (
                        <Box
                            sx={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                right: 0,
                                height: "2px",
                                background: `linear-gradient(90deg, ${colors.lime.main}, ${colors.lime.light})`,
                                opacity: 0.6,
                            }}
                        />
                    )}
                    {isTyping ? (
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                            }}
                        >
                            <CircularProgress
                                size={16}
                                sx={{ color: colors.lime.main }}
                            />
                            <Typography
                                variant="body2"
                                sx={{ color: "rgba(255,255,255,0.8)" }}
                            >
                                Polly is thinking...
                            </Typography>
                        </Box>
                    ) : isBot ? (
                        <ReactMarkdown
                            components={MarkdownComponents}
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                            sx={{
                                "& > *:last-child": { mb: 0 },
                                "& > *:first-of-type": { mt: 0 },
                            }}
                        >
                            {message}
                        </ReactMarkdown>
                    ) : (
                        <Typography
                            variant="body1"
                            sx={{
                                lineHeight: 1.6,
                                whiteSpace: "pre-wrap",
                                fontSize: "0.95rem",
                            }}
                        >
                            {message}
                        </Typography>
                    )}
                    {timestamp && !isTyping && (
                        <Typography
                            variant="caption"
                            sx={{
                                color: "rgba(255,255,255,0.5)",
                                display: "block",
                                textAlign: "right",
                                mt: 1,
                                fontSize: "0.7rem",
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
                        bgcolor: "rgba(255,255,255,0.1)",
                        border: "2px solid rgba(255,255,255,0.2)",
                    }}
                />
            )}
        </motion.div>
    );
};

const _SuggestedQuestion = ({ question, onClick, icon }) => (
    <motion.div whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}>
        <Card
            onClick={() => onClick(question)}
            elevation={0}
            sx={{
                cursor: "pointer",
                background:
                    "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "12px",
                transition: "all 0.3s ease",
                "&:hover": {
                    borderColor: colors.lime.border,
                    background:
                        "linear-gradient(135deg, rgba(163, 230, 53, 0.1) 0%, rgba(163, 230, 53, 0.05) 100%)",
                    boxShadow: "0 8px 32px rgba(163, 230, 53, 0.2)",
                },
            }}
        >
            <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box sx={{ color: colors.lime.main, fontSize: "1.2rem" }}>
                        {icon}
                    </Box>
                    <Typography
                        variant="body2"
                        sx={{
                            color: "rgba(255,255,255,0.9)",
                            fontWeight: 500,
                            lineHeight: 1.4,
                        }}
                    >
                        {question}
                    </Typography>
                </Box>
            </CardContent>
        </Card>
    </motion.div>
);

const PollyChat = () => {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [_expandedFaq, _setExpandedFaq] = useState(null);
    const [faqData, setFaqData] = useState([]);
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const pollyAPI = useRef(new socBotAPI()); // API class name unchanged

    // Group FAQ by category
    const _faqByCategory = faqData.reduce((acc, item) => {
        if (!acc[item.category]) {
            acc[item.category] = [];
        }
        acc[item.category].push(item);
        return acc;
    }, {});

    useEffect(() => {
        document.title = "AI Assistant | GSoC × pollinations.ai";
        parseFaq().then(setFaqData);
        setMessages([
            {
                id: 1,
                content:
                    "Hello! I'm Polly, your AI assistant for Google Summer of Code 2026 at pollinations.ai! 🌱\n\nI'm here to help you with everything related to GSoC - from understanding the program to choosing projects, application guidance, and technical support.\n\nWhat would you like to know about GSoC 2026?",
                isBot: true,
                timestamp: new Date().toISOString(),
            },
        ]);
    }, []);

    const scrollToBottom = useCallback(() => {
        setTimeout(() => {
            if (messagesContainerRef.current) {
                const container = messagesContainerRef.current;
                container.scrollTo({
                    top: container.scrollHeight,
                    behavior: "smooth",
                });
            }
        }, 100);
    }, []);

    useEffect(() => {
        if (messages.length > 1) {
            scrollToBottom();
        }
    }, [messages, scrollToBottom]);

    const handleSendMessage = async (messageText = inputValue) => {
        if (!messageText.trim()) return;

        const userMessage = {
            id: Date.now(),
            content: messageText,
            isBot: false,
            timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInputValue("");
        setIsLoading(true);
        scrollToBottom();

        const typingMessage = {
            id: Date.now() + 1,
            content: "",
            isBot: true,
            isTyping: true,
        };
        setMessages((prev) => [...prev, typingMessage]);

        try {
            const response = await pollyAPI.current.sendMessage(messageText);
            setMessages((prev) => {
                const withoutTyping = prev.filter((msg) => !msg.isTyping);
                return [
                    ...withoutTyping,
                    {
                        id: Date.now() + 2,
                        content: response.message,
                        isBot: true,
                        timestamp: response.timestamp,
                    },
                ];
            });
        } catch (error) {
            console.error("Chat error:", error);
            setMessages((prev) => {
                const withoutTyping = prev.filter((msg) => !msg.isTyping);
                return [
                    ...withoutTyping,
                    {
                        id: Date.now() + 2,
                        content:
                            "I apologize, but I'm experiencing some technical difficulties. Please try again or check our FAQ and documentation pages for immediate help.",
                        isBot: true,
                        timestamp: new Date().toISOString(),
                    },
                ];
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleFaqClick = async (question) => {
        await handleSendMessage(question);
    };

    const _suggestedQuestions = pollyAPI.current.getSuggestedQuestions();
    const _questionIcons = [
        <LightbulbOutlined key="lightbulb-1" />,
        <RocketLaunchOutlined key="rocket-1" />,
        <SchoolOutlined key="school-1" />,
        <CodeOutlined key="code-1" />,
        <LightbulbOutlined key="lightbulb-2" />,
        <SchoolOutlined key="school-2" />,
        <CodeOutlined key="code-2" />,
        <RocketLaunchOutlined key="rocket-2" />,
    ];

    const categoryColors = {
        "General": colors.lime.main,
        "Application": colors.lime.light,
        "Projects": "#10b981",
        "Timeline": "#f59e0b",
        "Mentorship": "#8b5cf6",
        "Technical": "#ec4899",
        "Community": "#06b6d4",
        "Contribution": "#22c55e",
        "Selection": "#f59e0b",
        "Support": colors.lime.main,
        "Post-GSoC": "#a78bfa",
        "Troubleshooting": "#ef4444",
    };

    return (
        <Box
            sx={{
                minHeight: "100vh",
                bgcolor: colors.bg.deep,
                position: "relative",
                overflow: "hidden",
            }}
        >
            <Box
                sx={{
                    position: "absolute",
                    top: "-10%",
                    right: "-5%",
                    width: "500px",
                    height: "500px",
                    background: `radial-gradient(circle, ${colors.lime.dim} 0%, rgba(0,0,0,0) 70%)`,
                    zIndex: 0,
                    pointerEvents: "none",
                }}
            />
            <Box
                sx={{
                    position: "absolute",
                    bottom: "-10%",
                    left: "-5%",
                    width: "400px",
                    height: "400px",
                    background:
                        "radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, rgba(0,0,0,0) 70%)",
                    zIndex: 0,
                    pointerEvents: "none",
                }}
            />

            <Container
                maxWidth="md"
                sx={{
                    position: "relative",
                    mt: 1,
                    zIndex: 1,
                    py: 4,
                    height: "calc(100vh - 70px)",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <Box sx={{ textAlign: "center", mb: 3 }}>
                        <Typography
                            variant="h2"
                            sx={{
                                fontWeight: 700,
                                letterSpacing: "-0.02em",
                                background:
                                    "linear-gradient(to bottom right, #fff, #a1a1aa)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                            }}
                        >
                            Hello I am Polly, your GSoC guide.
                        </Typography>
                    </Box>
                </motion.div>
                <Box
                    ref={messagesContainerRef}
                    sx={{
                        flex: 1,
                        overflowY: "auto",
                        mb: 2,
                        px: 1,
                        scrollBehavior: "smooth",
                        maxHeight: "calc(100vh - 100px)",
                        "&::-webkit-scrollbar": {
                            width: "6px",
                        },
                        "&::-webkit-scrollbar-track": {
                            background: "rgba(255,255,255,0.05)",
                            borderRadius: "10px",
                        },
                        "&::-webkit-scrollbar-thumb": {
                            background: colors.lime.border,
                            borderRadius: "10px",
                        },
                        "&::-webkit-scrollbar-thumb:hover": {
                            background: colors.lime.glow,
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
                            background:
                                "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)",
                            backdropFilter: "blur(20px)",
                            border: "1px solid rgba(255,255,255,0.15)",
                            borderRadius: "25px",
                            p: 1,
                            mb: 2,
                        }}
                    >
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                            }}
                        >
                            <TextField
                                fullWidth
                                multiline
                                maxRows={3}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder="Ask me anything about GSoC 2026..."
                                variant="standard"
                                disabled={isLoading}
                                InputProps={{
                                    disableUnderline: true,
                                }}
                                sx={{
                                    "& .MuiInputBase-input": {
                                        color: "#fff",
                                        fontSize: "1rem",
                                        px: 2,
                                        py: 1.5,
                                        "&::placeholder": {
                                            color: "rgba(255,255,255,0.5)",
                                        },
                                    },
                                }}
                            />
                            <IconButton
                                onClick={() => handleSendMessage()}
                                disabled={isLoading || !inputValue.trim()}
                                sx={{
                                    color: inputValue.trim()
                                        ? colors.lime.main
                                        : "rgba(255,255,255,0.3)",
                                    p: 1,
                                    transition: "all 0.2s ease",
                                    "&:hover": {
                                        color: colors.lime.light,
                                        bgcolor: "transparent",
                                    },
                                    "&:disabled": {
                                        color: "rgba(255,255,255,0.2)",
                                    },
                                }}
                            >
                                {isLoading ? (
                                    <CircularProgress
                                        size={20}
                                        sx={{
                                            color: colors.lime.glow,
                                        }}
                                    />
                                ) : (
                                    <ArrowUpwardRounded sx={{ fontSize: 26 }} />
                                )}
                            </IconButton>
                        </Box>
                    </Paper>
                </motion.div>
            </Container>

            {/* FAQ Section - Always Visible */}
            <Box
                sx={{
                    bgcolor: colors.bg.deep,
                    py: 3,
                    borderTop: `1px solid ${colors.border.light}`,
                }}
            >
                <Container
                    maxWidth="md"
                    sx={{ position: "relative", zIndex: 1 }}
                >
                    <Typography
                        variant="subtitle2"
                        sx={{
                            color: "rgba(255,255,255,0.5)",
                            mb: 2,
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            fontWeight: 600,
                            fontSize: "0.7rem",
                        }}
                    >
                        Frequently Asked Questions
                    </Typography>
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: {
                                xs: "1fr",
                                md: "1fr 1fr",
                            },
                            gap: 1,
                        }}
                    >
                        {faqData.slice(0, 10).map((faq) => {
                            const categoryColor =
                                categoryColors[faq.category] ||
                                colors.lime.main;

                            return (
                                <Box
                                    key={faq.id}
                                    onClick={() => handleFaqClick(faq.question)}
                                    sx={{
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 1,
                                        px: 2,
                                        py: 1.5,
                                        borderRadius: "8px",
                                        bgcolor: "rgba(255,255,255,0.03)",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                        transition: "all 0.2s ease",
                                        "&:hover": {
                                            bgcolor: "rgba(255,255,255,0.06)",
                                            borderColor: `${categoryColor}50`,
                                            transform: "translateX(4px)",
                                        },
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            color: "rgba(255,255,255,0.9)",
                                            fontSize: "0.85rem",
                                            fontWeight: 500,
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                        }}
                                    >
                                        {faq.question}
                                    </Typography>
                                    <Chip
                                        label={faq.category}
                                        size="small"
                                        sx={{
                                            height: "20px",
                                            fontSize: "0.65rem",
                                            fontWeight: 600,
                                            bgcolor: `${categoryColor}20`,
                                            color: categoryColor,
                                            border: `1px solid ${categoryColor}40`,
                                            flexShrink: 0,
                                        }}
                                    />
                                </Box>
                            );
                        })}
                    </Box>
                </Container>
            </Box>
        </Box>
    );
};

export default PollyChat;
