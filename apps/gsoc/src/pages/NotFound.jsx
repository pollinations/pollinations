import { ArrowBack, Home as HomeIcon } from "@mui/icons-material";
import { Box, Button, Stack, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { Link } from "react-router-dom";

const fadeInUp = {
    hidden: { opacity: 0, y: 30 },
    visible: (i = 0) => ({
        opacity: 1,
        y: 0,
        transition: {
            delay: i * 0.1,
            duration: 0.6,
            ease: "easeOut",
        },
    }),
};

const float = {
    animate: {
        y: [0, -20, 0],
        transition: {
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
        },
    },
};

const NotFoundPage = () => {
    useEffect(() => {
        document.title = "404 - Page Not Found | GSoC 2026";
    }, []);

    const funnyMessages = [
        "This page went to space before the rockets could launch! 🚀",
        "Looks like this page decided to take a summer break early... 😴",
        "Our AI ate this page for breakfast! 🤖",
        "This page is as lost as a student without GSoC mentorship! 📚",
        "Plot twist: This page never existed! 👻",
        "404: Dream Job Not Found... wait, wrong error! 💼",
        "This page went back in time and doesn't exist yet! ⏰",
        "The code gremlins took this one! They're hungry... 😈",
    ];

    const randomMessage =
        funnyMessages[Math.floor(Math.random() * funnyMessages.length)];

    return (
        <Box
            sx={{
                minHeight: "100vh",
                bgcolor: "#09090b",
                position: "relative",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                py: 4,
            }}
        >
            {/* Background gradients */}
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
                    bottom: "-10%",
                    right: "-5%",
                    width: "500px",
                    height: "500px",
                    background:
                        "radial-gradient(circle, rgba(96, 165, 250, 0.1) 0%, rgba(0,0,0,0) 70%)",
                    zIndex: 0,
                    pointerEvents: "none",
                }}
            />

            <Box
                sx={{
                    position: "relative",
                    zIndex: 1,
                    maxWidth: "800px",
                    width: "100%",
                    px: 2,
                }}
            >
                <motion.div
                    variants={fadeInUp}
                    initial="hidden"
                    animate="visible"
                    custom={0}
                >
                    <Box sx={{ textAlign: "center", mb: 2 }}>
                        <motion.div animate={float.animate}>
                            <Typography
                                variant="h1"
                                sx={{
                                    fontWeight: 900,
                                    letterSpacing: "-0.05em",
                                    background:
                                        "linear-gradient(135deg, #60a5fa 0%, #a1a1aa 50%, #ffffff 100%)",
                                    backgroundClip: "text",
                                    WebkitBackgroundClip: "text",
                                    color: "transparent",
                                    WebkitTextFillColor: "transparent",
                                    fontSize: {
                                        xs: "4.5rem",
                                        md: "6rem",
                                        lg: "7rem",
                                    },
                                    lineHeight: 1,
                                    fontFamily:
                                        '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
                                    mb: 2,
                                    textShadow:
                                        "0 20px 60px rgba(96, 165, 250, 0.2)",
                                }}
                            >
                                404
                            </Typography>
                        </motion.div>

                        <Typography
                            variant="h3"
                            sx={{
                                fontWeight: 700,
                                color: "#ffffff",
                                mb: 2,
                                fontSize: { xs: "1.8rem", md: "2.2rem" },
                            }}
                        >
                            Oops! Page Lost in the Code
                        </Typography>

                        <Box
                            sx={{
                                p: 3,
                                borderRadius: "16px",
                                background:
                                    "linear-gradient(135deg, rgba(96, 165, 250, 0.15) 0%, rgba(255,255,255,0.05) 100%)",
                                border: "1px solid rgba(96, 165, 250, 0.25)",
                                mb: 4,
                            }}
                        >
                            <Typography
                                variant="h5"
                                sx={{
                                    color: "#60a5fa",
                                    fontWeight: 600,
                                    fontSize: { xs: "1.1rem", md: "1.3rem" },
                                }}
                            >
                                {randomMessage}
                            </Typography>
                        </Box>

                        <Typography
                            variant="body1"
                            sx={{
                                color: "rgba(255,255,255,0.8)",
                                mb: 4,
                                fontSize: "1.1rem",
                                lineHeight: 1.6,
                                maxWidth: "500px",
                                mx: "auto",
                            }}
                        >
                            The page you're looking for has vanished into the
                            digital void. But don't worry, our mentors can guide
                            you back to the right path!
                        </Typography>
                    </Box>
                </motion.div>

                {/* Action buttons */}
                <motion.div
                    variants={fadeInUp}
                    initial="hidden"
                    animate="visible"
                    custom={3}
                >
                    <Box sx={{ display: "flex", justifyContent: "center" }}>
                        <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={2}
                        >
                            <Button
                                component={Link}
                                to="/"
                                variant="contained"
                                size="large"
                                startIcon={<HomeIcon />}
                                sx={{
                                    bgcolor: "rgba(96, 165, 250, 0.2)",
                                    color: "#60a5fa",
                                    textTransform: "none",
                                    fontSize: "1rem",
                                    fontWeight: 600,
                                    py: 1.5,
                                    px: 4,
                                    borderRadius: "12px",
                                    border: "1px solid rgba(96, 165, 250, 0.4)",
                                    backdropFilter: "blur(20px)",
                                    transition: "all 0.3s ease",
                                    "&:hover": {
                                        bgcolor: "rgba(96, 165, 250, 0.3)",
                                        borderColor: "#60a5fa",
                                        transform: "translateY(-2px)",
                                        boxShadow:
                                            "0 8px 24px rgba(96, 165, 250, 0.2)",
                                    },
                                }}
                            >
                                Back to Home
                            </Button>
                            <Button
                                component={Link}
                                to="/about"
                                variant="outlined"
                                size="large"
                                startIcon={<ArrowBack />}
                                sx={{
                                    borderColor: "rgba(255,255,255,0.3)",
                                    color: "#fff",
                                    textTransform: "none",
                                    fontSize: "1rem",
                                    fontWeight: 600,
                                    py: 1.5,
                                    px: 4,
                                    borderRadius: "12px",
                                    transition: "all 0.3s ease",
                                    "&:hover": {
                                        borderColor: "rgba(255,255,255,0.5)",
                                        backgroundColor:
                                            "rgba(255,255,255,0.05)",
                                        transform: "translateY(-2px)",
                                    },
                                }}
                            >
                                About Us
                            </Button>
                        </Stack>
                    </Box>
                </motion.div>

                {/* Decorative elements */}
                <Box
                    sx={{
                        mt: 6,
                        p: 3,
                        borderRadius: "16px",
                        background:
                            "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        textAlign: "center",
                    }}
                >
                    <Typography
                        variant="body2"
                        sx={{ color: "rgba(255,255,255,0.6)" }}
                    >
                        💡 Pro tip: Try exploring our{" "}
                        <Link
                            to="/projects"
                            style={{
                                color: "#60a5fa",
                                textDecoration: "none",
                                fontWeight: 600,
                            }}
                        >
                            amazing projects
                        </Link>{" "}
                        or check the{" "}
                        <Link
                            to="/mentors"
                            style={{
                                color: "#60a5fa",
                                textDecoration: "none",
                                fontWeight: 600,
                            }}
                        >
                            mentors page
                        </Link>{" "}
                        instead!
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
};

export default NotFoundPage;
