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
import { colors, gradients } from "../theme";

const CodeOfConduct = () => {
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        document.title = "Code of Conduct | GSoC × pollinations.ai";
        fetch("/GSOC/CODE_OF_CONDUCT.md")
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Failed to fetch code of conduct");
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
                    bgcolor: colors.bg.deep,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <CircularProgress sx={{ color: colors.lime.main }} />
            </Box>
        );
    }

    if (error) {
        return (
            <Box
                sx={{
                    minHeight: "100vh",
                    bgcolor: colors.bg.deep,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <Typography
                    variant="h6"
                    sx={{ color: colors.status.error.main }}
                >
                    Error: {error}
                </Typography>
            </Box>
        );
    }

    return (
        <Box
            sx={{
                minHeight: "100vh",
                bgcolor: colors.bg.deep,
                pt: { xs: 10, md: 12 },
                pb: 8,
                position: "relative",
                overflow: "hidden",
            }}
        >
            <Box
                sx={{
                    position: "absolute",
                    top: "-20%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "800px",
                    height: "800px",
                    background:
                        "radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0) 70%)",
                    zIndex: 0,
                    pointerEvents: "none",
                }}
            />

            <Box
                sx={{
                    position: "absolute",
                    top: "20%",
                    right: "-10%",
                    width: "400px",
                    height: "400px",
                    background: gradients.glowLime,
                    zIndex: 0,
                    pointerEvents: "none",
                }}
            />

            <Box sx={{ position: "relative", zIndex: 1 }}>
                <Container maxWidth="lg">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <Paper
                            sx={{
                                bgcolor: colors.bg.cardGlass,
                                backdropFilter: "blur(10px)",
                                border: `1px solid ${colors.border.medium}`,
                                borderRadius: 3,
                                p: { xs: 3, md: 6 },
                                "& .markdown-content": {
                                    color: colors.text.primary,
                                    "& h1": {
                                        color: colors.text.primary,
                                        fontWeight: 700,
                                        fontSize: "2.5rem",
                                        mb: 3,
                                        borderBottom: `2px solid ${colors.lime.main}`,
                                        pb: 2,
                                    },
                                    "& h2": {
                                        color: colors.lime.main,
                                        fontWeight: 600,
                                        fontSize: "1.8rem",
                                        mt: 4,
                                        mb: 2,
                                    },
                                    "& h3": {
                                        color: colors.lime.light,
                                        fontWeight: 600,
                                        fontSize: "1.4rem",
                                        mt: 3,
                                        mb: 2,
                                    },
                                    "& h4": {
                                        color: colors.sage.main,
                                        fontWeight: 600,
                                        fontSize: "1.2rem",
                                        mt: 2,
                                        mb: 1,
                                    },
                                    "& p": {
                                        color: colors.text.secondary,
                                        lineHeight: 1.7,
                                        mb: 2,
                                    },
                                    "& ul, & ol": {
                                        color: colors.text.secondary,
                                        pl: 3,
                                        mb: 2,
                                    },
                                    "& li": {
                                        mb: 1,
                                    },
                                    "& strong": {
                                        color: colors.text.primary,
                                        fontWeight: 600,
                                    },
                                    "& code": {
                                        bgcolor: colors.lime.dim,
                                        color: colors.lime.main,
                                        px: 1,
                                        py: 0.5,
                                        borderRadius: 1,
                                        fontFamily: "monospace",
                                        fontSize: "0.9em",
                                    },
                                    "& pre": {
                                        bgcolor: colors.bg.cardGlass,
                                        border: `1px solid ${colors.border.medium}`,
                                        borderRadius: 2,
                                        p: 2,
                                        overflow: "auto",
                                        mb: 2,
                                        "& code": {
                                            bgcolor: "transparent",
                                            color: colors.text.secondary,
                                            p: 0,
                                        },
                                    },
                                    "& blockquote": {
                                        borderLeft: `4px solid ${colors.lime.main}`,
                                        bgcolor: colors.lime.dim,
                                        pl: 3,
                                        pr: 2,
                                        py: 2,
                                        mb: 2,
                                        borderRadius: 1,
                                        "& p": {
                                            color: colors.text.secondary,
                                            mb: 0,
                                        },
                                    },
                                    "& a": {
                                        color: colors.lime.main,
                                        textDecoration: "none",
                                        borderBottom: "1px solid transparent",
                                        transition: "all 0.2s ease",
                                        "&:hover": {
                                            color: colors.lime.light,
                                            borderBottom: `1px solid ${colors.lime.light}`,
                                        },
                                    },
                                    "& table": {
                                        width: "100%",
                                        border: `1px solid ${colors.border.medium}`,
                                        borderRadius: 2,
                                        overflow: "hidden",
                                        mb: 2,
                                    },
                                    "& th, & td": {
                                        border: `1px solid ${colors.border.medium}`,
                                        p: 2,
                                        textAlign: "left",
                                    },
                                    "& th": {
                                        bgcolor: colors.lime.dim,
                                        color: colors.lime.main,
                                        fontWeight: 600,
                                    },
                                    "& td": {
                                        color: colors.text.secondary,
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
                                                    border: `1px solid ${colors.border.medium}`,
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
        </Box>
    );
};

export default CodeOfConduct;
