import {
    Box,
    CircularProgress,
    Container,
    Paper,
    Typography,
} from "@mui/material";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const CodeOfConduct = () => {
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        document.title = "Privacy | GSoC × pollinations.ai";
        fetch("/LEGAL/PRIVACY_POLICY.md")
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Failed to fetch privacy policy");
                }
                return response.text();
            })
            .then((text) => {
                setContent(text);
                setLoading(false);
            })
            .catch((err) => {
                console.error("Error fetching code of conduct:", err);
                setError(err.message);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <Box
                sx={{
                    minHeight: "100vh",
                    bgcolor: "#09090b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <CircularProgress sx={{ color: "#60a5fa" }} />
            </Box>
        );
    }

    if (error) {
        return (
            <Box
                sx={{
                    minHeight: "100vh",
                    bgcolor: "#09090b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <Typography variant="h6" sx={{ color: "#ef4444" }}>
                    Error: {error}
                </Typography>
            </Box>
        );
    }

    return (
        <Box
            sx={{
                minHeight: "100vh",
                bgcolor: "#09090b",
                pt: { xs: 10, md: 12 },
                pb: 8,
            }}
        >
            <Container maxWidth="lg">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <Paper
                        sx={{
                            bgcolor: "rgba(255, 255, 255, 0.03)",
                            backdropFilter: "blur(10px)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            borderRadius: 3,
                            p: { xs: 3, md: 6 },
                            "& .markdown-content": {
                                color: "#fff",
                                "& h1": {
                                    color: "#fff",
                                    fontWeight: 700,
                                    fontSize: "2.5rem",
                                    mb: 3,
                                    borderBottom: "2px solid #60a5fa",
                                    pb: 2,
                                },
                                "& h2": {
                                    color: "#60a5fa",
                                    fontWeight: 600,
                                    fontSize: "1.8rem",
                                    mt: 4,
                                    mb: 2,
                                },
                                "& h3": {
                                    color: "#93c5fd",
                                    fontWeight: 600,
                                    fontSize: "1.4rem",
                                    mt: 3,
                                    mb: 2,
                                },
                                "& h4": {
                                    color: "#bfdbfe",
                                    fontWeight: 600,
                                    fontSize: "1.2rem",
                                    mt: 2,
                                    mb: 1,
                                },
                                "& p": {
                                    color: "rgba(255, 255, 255, 0.8)",
                                    lineHeight: 1.7,
                                    mb: 2,
                                },
                                "& ul, & ol": {
                                    color: "rgba(255, 255, 255, 0.8)",
                                    pl: 3,
                                    mb: 2,
                                },
                                "& li": {
                                    mb: 1,
                                },
                                "& strong": {
                                    color: "#fff",
                                    fontWeight: 600,
                                },
                                "& code": {
                                    bgcolor: "rgba(96, 165, 250, 0.1)",
                                    color: "#60a5fa",
                                    px: 1,
                                    py: 0.5,
                                    borderRadius: 1,
                                    fontFamily: "monospace",
                                    fontSize: "0.9em",
                                },
                                "& pre": {
                                    bgcolor: "rgba(255, 255, 255, 0.05)",
                                    border: "1px solid rgba(255, 255, 255, 0.1)",
                                    borderRadius: 2,
                                    p: 2,
                                    overflow: "auto",
                                    mb: 2,
                                    "& code": {
                                        bgcolor: "transparent",
                                        color: "rgba(255, 255, 255, 0.9)",
                                        p: 0,
                                    },
                                },
                                "& blockquote": {
                                    borderLeft: "4px solid #60a5fa",
                                    bgcolor: "rgba(96, 165, 250, 0.05)",
                                    pl: 3,
                                    pr: 2,
                                    py: 2,
                                    mb: 2,
                                    borderRadius: 1,
                                    "& p": {
                                        color: "rgba(255, 255, 255, 0.9)",
                                        mb: 0,
                                    },
                                },
                                "& a": {
                                    color: "#60a5fa",
                                    textDecoration: "none",
                                    borderBottom: "1px solid transparent",
                                    transition: "all 0.2s ease",
                                    "&:hover": {
                                        color: "#93c5fd",
                                        borderBottom: "1px solid #93c5fd",
                                    },
                                },
                                "& table": {
                                    width: "100%",
                                    border: "1px solid rgba(255, 255, 255, 0.1)",
                                    borderRadius: 2,
                                    overflow: "hidden",
                                    mb: 2,
                                },
                                "& th, & td": {
                                    border: "1px solid rgba(255, 255, 255, 0.1)",
                                    p: 2,
                                    textAlign: "left",
                                },
                                "& th": {
                                    bgcolor: "rgba(96, 165, 250, 0.1)",
                                    color: "#60a5fa",
                                    fontWeight: 600,
                                },
                                "& td": {
                                    color: "rgba(255, 255, 255, 0.8)",
                                },
                            },
                        }}
                    >
                        <Box className="markdown-content">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    img: ({ src, alt, ...props }) => (
                                        <img
                                            src={src}
                                            alt={alt}
                                            {...props}
                                            style={{
                                                maxWidth: "100%",
                                                height: "auto",
                                                borderRadius: "8px",
                                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                            }}
                                        />
                                    ),
                                }}
                            >
                                {content}
                            </ReactMarkdown>
                        </Box>
                    </Paper>
                </motion.div>
            </Container>
        </Box>
    );
};

export default CodeOfConduct;
