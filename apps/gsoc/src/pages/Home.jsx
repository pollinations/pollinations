import {
    ArrowForward,
    EmojiEvents,
    Gavel,
    Group,
    MenuBook,
    Rocket,
    Star,
    Timeline as TimelineIcon,
    VerifiedUser,
} from "@mui/icons-material";
import {
    Avatar,
    Badge,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Divider,
    Grid,
    IconButton,
    Stack,
    Tooltip,
    Typography,
} from "@mui/material";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import useTopContributors from "../api/githubContri";
import CountdownButton from "../components/CountdownButton";
import EasterEggModal from "../components/EasterEggModal";
import useEasterEgg from "../hooks/useEasterEgg";

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

const HomePage = () => {
    useEffect(() => {
        document.title = "GSoC 26' - pollinations.ai";
    }, []);

    const {
        clickCount,
        showEasterEgg,
        showHint,
        handleLogoClick,
        closeEasterEgg,
    } = useEasterEgg();
    const { contributors, loading, error } = useTopContributors();

    const stats = [
        { number: "3.8K", label: "GitHub Stars", icon: <Star /> },
        { number: "250+", label: "Contributors", icon: <Group /> },
        { number: "1st", label: "Year in GSoC", icon: <EmojiEvents /> },
        { number: "12", label: "Week Program", icon: <TimelineIcon /> },
    ];

    const navigationItems = [
        { icon: <Rocket />, path: "/about", tooltip: "About Us" },
        {
            icon: <VerifiedUser />,
            path: "/mentors",
            tooltip: "Meet Our Mentors",
        },
        {
            icon: <MenuBook />,
            path: "/contributing",
            tooltip: "Contributing Guide",
        },
        { icon: <Gavel />, path: "/coc", tooltip: "Code of Conduct" },
    ];

    return (
        <Box
            sx={{
                minHeight: "100vh",
                bgcolor: "#09090b",
                position: "relative",
                overflow: "hidden",
                "@keyframes pulse": {
                    "0%, 100%": { opacity: 0.4 },
                    "50%": { opacity: 0.8 },
                },
                "@keyframes fadeInOut": {
                    "0%, 100%": { opacity: 0.1 },
                    "50%": { opacity: 0.6 },
                },
            }}
        >
            <EasterEggModal open={showEasterEgg} onClose={closeEasterEgg} />
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
                    background:
                        "radial-gradient(circle, rgba(96, 165, 250, 0.1) 0%, rgba(0,0,0,0) 70%)",
                    zIndex: 0,
                    pointerEvents: "none",
                }}
            />

            <Box sx={{ position: "relative", zIndex: 1 }}>
                <Box
                    sx={{
                        minHeight: "100vh",
                        display: "flex",
                        alignItems: "center",
                        px: { xs: 2, md: 4 },
                        py: 4,
                    }}
                >
                    <Box
                        sx={{
                            maxWidth: "1400px",
                            margin: "0 auto",
                            width: "100%",
                        }}
                    >
                        <Grid
                            container
                            spacing={6}
                            alignItems="center"
                            justifyContent="center"
                        >
                            <Grid item xs={12} lg={7}>
                                <motion.div
                                    variants={fadeInUp}
                                    initial="hidden"
                                    animate="visible"
                                    custom={0}
                                >
                                    <Box
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 3,
                                            mb: 4,
                                            flexWrap: "wrap",
                                            justifyContent: "center",
                                        }}
                                    >
                                        <Box
                                            onClick={() => {
                                                location.href =
                                                    "https://summerofcode.withgoogle.com";
                                            }}
                                            sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 2,
                                                cursor: "pointer",
                                                userSelect: "none",
                                            }}
                                        >
                                            <img
                                                src="/gsoc_logo.webp"
                                                alt="Google Summer of Code"
                                                style={{
                                                    height: "60px",
                                                }}
                                            />
                                        </Box>

                                        <Typography
                                            variant="h4"
                                            sx={{
                                                color: "rgba(255,255,255,0.6)",
                                                fontWeight: 300,
                                                mx: 1,
                                            }}
                                        >
                                            ×
                                        </Typography>

                                        <Box
                                            sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 2,
                                                cursor: "pointer",
                                                userSelect: "none",
                                                position: "relative",
                                            }}
                                        >
                                            <Tooltip
                                                title={
                                                    showHint
                                                        ? "Click 3 times for a surprise!"
                                                        : ""
                                                }
                                                open={showHint}
                                                placement="top"
                                                arrow
                                                sx={{ opacity: "0.3" }}
                                            >
                                                <motion.div
                                                    animate={
                                                        showHint
                                                            ? {
                                                                  scale: [
                                                                      1, 1.05,
                                                                      1,
                                                                  ],
                                                              }
                                                            : {}
                                                    }
                                                    transition={{
                                                        duration: 0.5,
                                                        repeat: showHint
                                                            ? Infinity
                                                            : 0,
                                                    }}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        handleLogoClick();
                                                    }}
                                                    style={{
                                                        cursor: "pointer",
                                                        position: "relative",
                                                        display: "flex",
                                                        alignItems: "center",
                                                    }}
                                                >
                                                    <img
                                                        src="/polli_white.svg"
                                                        alt="pollinations.ai"
                                                        style={{
                                                            height: "55px",
                                                        }}
                                                    />
                                                    {clickCount > 0 && (
                                                        <motion.div
                                                            initial={{
                                                                opacity: 0,
                                                                scale: 0.8,
                                                            }}
                                                            animate={{
                                                                opacity: 1,
                                                                scale: 1,
                                                            }}
                                                            style={{
                                                                position:
                                                                    "absolute",
                                                                bottom: -15,
                                                                left: "50%",
                                                                transform:
                                                                    "translateX(-50%)",
                                                                fontSize:
                                                                    "0.7rem",
                                                                color: "#60a5fa",
                                                                whiteSpace:
                                                                    "nowrap",
                                                                fontWeight: 600,
                                                                opacity: 0.3,
                                                            }}
                                                        >
                                                            {clickCount}/3
                                                        </motion.div>
                                                    )}
                                                </motion.div>
                                            </Tooltip>
                                        </Box>
                                    </Box>

                                    <Box
                                        sx={{
                                            position: "relative",
                                            mb: 4,
                                            textAlign: "center",
                                        }}
                                    >
                                        <Typography
                                            variant="h1"
                                            sx={{
                                                fontWeight: 800,
                                                letterSpacing: "-0.03em",
                                                background:
                                                    "linear-gradient(135deg, #ffffff 0%, #60a5fa 30%, #e0e7ff 60%, #a1a1aa 100%)",
                                                backgroundClip: "text",
                                                WebkitBackgroundClip: "text",
                                                color: "transparent",
                                                WebkitTextFillColor:
                                                    "transparent",
                                                fontSize: {
                                                    xs: "2.8rem",
                                                    md: "3.2rem",
                                                    lg: "3.5rem",
                                                },
                                                lineHeight: 1.05,
                                                fontFamily:
                                                    '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
                                                position: "relative",
                                                textAlign: "center",
                                            }}
                                        >
                                            2026 GSoC - with{" "}
                                            <Box
                                                component="span"
                                                sx={{
                                                    position: "relative",
                                                    background:
                                                        "linear-gradient(135deg, #ffffff 0%, #60a5fa 50%, #e0e7ff 100%)",
                                                    backgroundClip: "text",
                                                    WebkitBackgroundClip:
                                                        "text",
                                                    color: "transparent",
                                                    WebkitTextFillColor:
                                                        "transparent",
                                                }}
                                            >
                                                POLLINATIONS.AI
                                            </Box>{" "}
                                            <br></br>
                                            Celebrating Open Source Development
                                        </Typography>

                                        <Box
                                            sx={{
                                                position: "absolute",
                                                right: { xs: "10%", md: "15%" },
                                                top: "10%",
                                                width: "20px",
                                                height: "20px",
                                                background:
                                                    "radial-gradient(circle, #60a5fa 0%, transparent 70%)",
                                                borderRadius: "50%",
                                                opacity: 0.4,
                                                animation: "pulse 2s infinite",
                                            }}
                                        />
                                    </Box>

                                    <Box
                                        sx={{
                                            position: "relative",
                                            mb: 4,
                                            textAlign: "center",
                                        }}
                                    >
                                        <Typography
                                            variant="h5"
                                            sx={{
                                                color: "rgba(255,255,255,0.9)",
                                                fontWeight: 400,
                                                lineHeight: 1.5,
                                                maxWidth: "650px",
                                                fontSize: {
                                                    xs: "1.3rem",
                                                    md: "1.5rem",
                                                    lg: "1.6rem",
                                                },
                                                fontFamily:
                                                    '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
                                                position: "relative",
                                                textAlign: "center",
                                                margin: "0 auto",
                                            }}
                                        >
                                            This time with{" "}
                                            <Box
                                                component="span"
                                                onClick={() => {
                                                    location.href =
                                                        "https://summerofcode.withgoogle.com";
                                                }}
                                                sx={{
                                                    fontWeight: 600,
                                                    color: "#60a5fa",
                                                    textShadow:
                                                        "0 0 10px rgba(96, 165, 250, 0.3)",
                                                    userSelect: "none",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                Google Summer of Code 2026,
                                            </Box>{" "}
                                            a 16 years old program, run every
                                            summer, with the intention of
                                            bringing more students into open
                                            source.
                                        </Typography>

                                        <Box
                                            sx={{
                                                position: "absolute",
                                                right: "-40px",
                                                top: "20%",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: "8px",
                                                opacity: 0.3,
                                            }}
                                        >
                                            {[1, 2, 3].map((dot) => (
                                                <Box
                                                    key={dot}
                                                    sx={{
                                                        width: "4px",
                                                        height: "4px",
                                                        borderRadius: "50%",
                                                        bgcolor: "#60a5fa",
                                                        animation: `fadeInOut 3s infinite ${dot * 0.5}s`,
                                                    }}
                                                />
                                            ))}
                                        </Box>
                                    </Box>

                                    <Box
                                        sx={{
                                            display: "flex",
                                            justifyContent: "center",
                                            mb: 6,
                                        }}
                                    >
                                        <Stack
                                            direction={{
                                                xs: "column",
                                                sm: "row",
                                            }}
                                            spacing={3}
                                        >
                                            <Button
                                                component={Link}
                                                to="/projects"
                                                variant="contained"
                                                size="large"
                                                endIcon={<ArrowForward />}
                                                sx={{
                                                    bgcolor:
                                                        "rgba(255,255,255,0.15)",
                                                    color: "#fff",
                                                    textTransform: "none",
                                                    fontSize: "1.1rem",
                                                    fontWeight: 600,
                                                    py: 2,
                                                    px: 4,
                                                    borderRadius: "12px",
                                                    backdropFilter:
                                                        "blur(20px)",
                                                    border: "1px solid rgba(255,255,255,0.2)",
                                                    "&:hover": {
                                                        bgcolor:
                                                            "rgba(255,255,255,0.25)",
                                                        transform:
                                                            "translateY(-2px)",
                                                        boxShadow:
                                                            "0 8px 32px rgba(255,255,255,0.15)",
                                                    },
                                                }}
                                            >
                                                Explore Projects
                                            </Button>
                                            <CountdownButton />
                                        </Stack>
                                    </Box>

                                    <Box
                                        sx={{
                                            display: "flex",
                                            justifyContent: "center",
                                            alignItems: "center",
                                            mb: 4,
                                        }}
                                    >
                                        <Grid
                                            container
                                            spacing={3}
                                            justifyContent="center"
                                            sx={{ maxWidth: "600px" }}
                                        >
                                            {stats.map((stat, index) => (
                                                <Grid
                                                    item
                                                    xs={6}
                                                    sm={3}
                                                    key={stat.label}
                                                >
                                                    <motion.div
                                                        variants={fadeInUp}
                                                        initial="hidden"
                                                        animate="visible"
                                                        custom={index + 1}
                                                    >
                                                        <Box
                                                            sx={{
                                                                height: "120px",
                                                                width: "120px",
                                                                background:
                                                                    "linear-gradient(145deg, rgba(18, 18, 27, 0.9), rgba(27, 27, 38, 0.6))",
                                                                borderRadius:
                                                                    "20px",
                                                                border: "1px solid rgba(255, 255, 255, 0.08)",
                                                                display: "flex",
                                                                flexDirection:
                                                                    "column",
                                                                alignItems:
                                                                    "center",
                                                                justifyContent:
                                                                    "center",
                                                                gap: 1.5,
                                                                textAlign:
                                                                    "center",
                                                                position:
                                                                    "relative",
                                                                overflow:
                                                                    "hidden",
                                                                boxShadow: `
                                      inset 0 1px 0 rgba(255, 255, 255, 0.05),
                                      inset 0 -1px 0 rgba(0, 0, 0, 0.2),
                                      0 4px 20px rgba(0, 0, 0, 0.15)
                                    `,
                                                                userSelect:
                                                                    "none",
                                                                cursor: "pointer",
                                                                transition:
                                                                    "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                                                                "&:hover": {
                                                                    transform:
                                                                        "translateY(-2px)",
                                                                    boxShadow: `
                                        inset 0 1px 0 rgba(255, 255, 255, 0.08),
                                        inset 0 -1px 0 rgba(0, 0, 0, 0.3),
                                        0 8px 30px rgba(0, 0, 0, 0.2),
                                        0 0 0 1px rgba(96, 165, 250, 0.1)
                                      `,
                                                                    "& .stat-icon":
                                                                        {
                                                                            color: "#60a5fa",
                                                                            transform:
                                                                                "scale(1.1)",
                                                                        },
                                                                },
                                                                "&:before": {
                                                                    content:
                                                                        '""',
                                                                    position:
                                                                        "absolute",
                                                                    top: 0,
                                                                    left: 0,
                                                                    right: 0,
                                                                    height: "1px",
                                                                    background:
                                                                        "linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)",
                                                                },
                                                                "&:after": {
                                                                    content:
                                                                        '""',
                                                                    position:
                                                                        "absolute",
                                                                    top: "50%",
                                                                    left: "50%",
                                                                    width: "60px",
                                                                    height: "60px",
                                                                    transform:
                                                                        "translate(-50%, -50%)",
                                                                    background:
                                                                        "radial-gradient(circle, rgba(96, 165, 250, 0.03) 0%, transparent 70%)",
                                                                    borderRadius:
                                                                        "50%",
                                                                    zIndex: 0,
                                                                },
                                                            }}
                                                        >
                                                            <Box
                                                                className="stat-icon"
                                                                sx={{
                                                                    color: "rgba(255, 255, 255, 0.7)",
                                                                    fontSize:
                                                                        "1.8rem",
                                                                    transition:
                                                                        "all 0.3s ease",
                                                                    zIndex: 1,
                                                                    filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))",
                                                                }}
                                                            >
                                                                {stat.icon}
                                                            </Box>
                                                            <Typography
                                                                variant="h5"
                                                                sx={{
                                                                    fontWeight: 700,
                                                                    color: "#fff",
                                                                    lineHeight: 1,
                                                                    zIndex: 1,
                                                                    textShadow:
                                                                        "0 2px 8px rgba(0, 0, 0, 0.3)",
                                                                    fontFamily:
                                                                        '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
                                                                }}
                                                            >
                                                                {stat.number}
                                                            </Typography>
                                                            <Typography
                                                                variant="caption"
                                                                sx={{
                                                                    color: "rgba(255, 255, 255, 0.6)",
                                                                    textTransform:
                                                                        "uppercase",
                                                                    fontWeight: 500,
                                                                    letterSpacing: 0.5,
                                                                    zIndex: 1,
                                                                    fontSize:
                                                                        "0.75rem",
                                                                    lineHeight: 1.2,
                                                                    fontFamily:
                                                                        '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
                                                                }}
                                                            >
                                                                {stat.label}
                                                            </Typography>
                                                        </Box>
                                                    </motion.div>
                                                </Grid>
                                            ))}
                                        </Grid>
                                    </Box>
                                </motion.div>
                            </Grid>
                        </Grid>

                        <Box
                            sx={{
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                position: "relative",
                                mt: 8,
                                px: { xs: 2, md: 4 },
                            }}
                        >
                            <Box
                                sx={{
                                    position: "absolute",
                                    left: { xs: 10, md: 50, lg: 150 },
                                    top: "20%",
                                    display: { xs: "none", md: "block" },
                                    zIndex: 0,
                                }}
                            >
                                <Box
                                    sx={{
                                        position: "relative",
                                        width: "80px",
                                        height: "80px",
                                    }}
                                >
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            width: "30px",
                                            height: "30px",
                                            border: "2px solid rgba(96, 165, 250, 0.3)",
                                            borderRadius: "4px",
                                            top: 0,
                                            left: 0,
                                            animation: "pulse 3s infinite",
                                        }}
                                    />
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            width: "20px",
                                            height: "20px",
                                            bgcolor: "rgba(96, 165, 250, 0.2)",
                                            borderRadius: "50%",
                                            top: "40px",
                                            left: "50px",
                                            animation:
                                                "fadeInOut 4s infinite 1s",
                                        }}
                                    />
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            width: "40px",
                                            height: "2px",
                                            bgcolor: "rgba(96, 165, 250, 0.4)",
                                            top: "70px",
                                            left: "10px",
                                            borderRadius: "1px",
                                        }}
                                    />
                                </Box>

                                <Box sx={{ mt: 4, opacity: 0.3 }}>
                                    {[60, 40, 35, 50].map((width, index) => (
                                        <Box
                                            key={`width-${width}`}
                                            sx={{
                                                width: `${width}px`,
                                                height: "2px",
                                                bgcolor: "#60a5fa",
                                                mb: "6px",
                                                borderRadius: "1px",
                                                animation: `fadeInOut 2s infinite ${index * 0.3}s`,
                                            }}
                                        />
                                    ))}
                                </Box>
                            </Box>

                            <Box
                                sx={{
                                    position: "absolute",
                                    right: { xs: 10, md: 50, lg: 150 },
                                    top: "30%",
                                    display: { xs: "none", md: "block" },
                                    zIndex: 0,
                                }}
                            >
                                <Box
                                    sx={{
                                        position: "relative",
                                        width: "70px",
                                        height: "70px",
                                    }}
                                >
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            width: "8px",
                                            height: "8px",
                                            border: "2px solid rgba(96, 165, 250, 0.4)",
                                            borderRadius: "50%",
                                            top: 0,
                                            left: 0,
                                        }}
                                    />
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            width: "30px",
                                            height: "2px",
                                            bgcolor: "rgba(96, 165, 250, 0.4)",
                                            top: "4px",
                                            left: "12px",
                                            borderRadius: "1px",
                                        }}
                                    />
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            width: "2px",
                                            height: "20px",
                                            bgcolor: "rgba(96, 165, 250, 0.4)",
                                            top: "15px",
                                            left: "40px",
                                            borderRadius: "1px",
                                        }}
                                    />
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            width: "15px",
                                            height: "15px",
                                            border: "2px solid rgba(96, 165, 250, 0.3)",
                                            top: "50px",
                                            left: "30px",
                                            transform: "rotate(45deg)",
                                            animation: "pulse 2s infinite 0.5s",
                                        }}
                                    />
                                </Box>

                                <Box sx={{ mt: 3 }}>
                                    {[1, 2, 3, 4, 5].map((particle) => (
                                        <Box
                                            key={particle}
                                            sx={{
                                                position: "absolute",
                                                width: "3px",
                                                height: "3px",
                                                borderRadius: "50%",
                                                bgcolor:
                                                    "rgba(96, 165, 250, 0.4)",
                                                left: `${Math.random() * 60}px`,
                                                top: `${Math.random() * 60}px`,
                                                animation: `fadeInOut 3s infinite ${particle * 0.6}s`,
                                            }}
                                        />
                                    ))}
                                </Box>
                            </Box>

                            <Box
                                sx={{
                                    maxWidth: "650px",
                                    width: "100%",
                                    position: "relative",
                                    zIndex: 2,
                                }}
                            >
                                <motion.div
                                    variants={fadeInUp}
                                    initial="hidden"
                                    animate="visible"
                                    custom={2}
                                >
                                    <Card
                                        elevation={0}
                                        sx={{
                                            background:
                                                "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
                                            backdropFilter: "blur(30px)",
                                            border: "1px solid rgba(255,255,255,0.15)",
                                            borderRadius: "24px",
                                            color: "#fff",
                                            position: "relative",
                                            overflow: "hidden",
                                        }}
                                    >
                                        <CardContent sx={{ p: 4 }}>
                                            <Box
                                                sx={{
                                                    display: "flex",
                                                    justifyContent: "center",
                                                    mb: 3,
                                                }}
                                            >
                                                <Chip
                                                    label="GSoC 2026"
                                                    sx={{
                                                        bgcolor:
                                                            "rgba(96, 165, 250, 0.15)",
                                                        color: "#60a5fa",
                                                        border: "1px solid rgba(96, 165, 250, 0.25)",
                                                        fontWeight: 600,
                                                        fontSize: "0.9rem",
                                                    }}
                                                />
                                            </Box>

                                            <Typography
                                                variant="h5"
                                                sx={{
                                                    fontWeight: 600,
                                                    mb: 3,
                                                    color: "#fff",
                                                    textAlign: "center",
                                                }}
                                            >
                                                About Google Summer of Code
                                            </Typography>

                                            <Typography
                                                variant="body1"
                                                sx={{
                                                    color: "rgba(255,255,255,0.8)",
                                                    lineHeight: 1.6,
                                                    mb: 4,
                                                    fontSize: "1rem",
                                                    textAlign: "justify",
                                                }}
                                            >
                                                Open source projects apply as
                                                mentor organizations and if they
                                                are accepted, students send
                                                proposals to them to work on a
                                                few months' long project.
                                                Projects can be planned out by
                                                the organizations in advance or
                                                can be proposed by students.
                                                Google pays the students, not
                                                the organizations they work
                                                with. Beginning in 2023, Google
                                                is opening the program up to all
                                                newcomers of open source that
                                                are 18 years and older.
                                            </Typography>

                                            <Box
                                                sx={{
                                                    p: 3,
                                                    borderRadius: "12px",
                                                    bgcolor:
                                                        "rgba(96, 165, 250, 0.08)",
                                                    border: "1px solid rgba(96, 165, 250, 0.15)",
                                                    mb: 4,
                                                    textAlign: "justify",
                                                }}
                                            >
                                                <Typography
                                                    variant="body1"
                                                    sx={{
                                                        color: "rgba(255,255,255,0.9)",
                                                        fontWeight: 500,
                                                    }}
                                                >
                                                    Join{" "}
                                                    <Box
                                                        component="span"
                                                        onClick={() => {
                                                            location.href =
                                                                "https://pollinations.ai";
                                                        }}
                                                        sx={{
                                                            fontWeight: "bold",
                                                            cursor: "pointer",
                                                            color: "#fff",
                                                            transition:
                                                                "all 0.3s ease",
                                                            "&:hover": {
                                                                color: "#60a5fa",
                                                            },
                                                        }}
                                                    >
                                                        pollinations.ai
                                                    </Box>{" "}
                                                    this summer as we embark on
                                                    an exciting journey of open
                                                    source development with
                                                    Google Summer of Code 2026!
                                                </Typography>
                                            </Box>

                                            <Divider
                                                sx={{
                                                    mb: 4,
                                                    borderColor:
                                                        "rgba(255,255,255,0.1)",
                                                }}
                                            />

                                            <Grid
                                                container
                                                spacing={2}
                                                justifyContent="center"
                                            >
                                                {navigationItems.map(
                                                    (item, index) => (
                                                        <Grid
                                                            item
                                                            xs={6}
                                                            key={item.path}
                                                            sx={{
                                                                display: "flex",
                                                                justifyContent:
                                                                    "center",
                                                            }}
                                                        >
                                                            <motion.div
                                                                variants={
                                                                    fadeInUp
                                                                }
                                                                initial="hidden"
                                                                animate="visible"
                                                                custom={
                                                                    index + 3
                                                                }
                                                            >
                                                                <Tooltip
                                                                    title={
                                                                        item.tooltip
                                                                    }
                                                                    placement="top"
                                                                    arrow
                                                                >
                                                                    <IconButton
                                                                        component={
                                                                            Link
                                                                        }
                                                                        to={
                                                                            item.path
                                                                        }
                                                                        sx={{
                                                                            width: 70,
                                                                            height: 70,
                                                                            background:
                                                                                "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
                                                                            border: "1px solid rgba(255,255,255,0.15)",
                                                                            borderRadius:
                                                                                "16px",
                                                                            color: "#60a5fa",
                                                                            fontSize:
                                                                                "2rem",
                                                                            transition:
                                                                                "all 0.3s ease",
                                                                            "&:hover":
                                                                                {
                                                                                    transform:
                                                                                        "translateY(-4px) scale(1.1)",
                                                                                    borderColor:
                                                                                        "#60a5fa",
                                                                                    backgroundColor:
                                                                                        "rgba(96, 165, 250, 0.15)",
                                                                                    boxShadow:
                                                                                        "0 8px 32px rgba(96, 165, 250, 0.25)",
                                                                                },
                                                                        }}
                                                                    >
                                                                        {
                                                                            item.icon
                                                                        }
                                                                    </IconButton>
                                                                </Tooltip>
                                                            </motion.div>
                                                        </Grid>
                                                    ),
                                                )}
                                            </Grid>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            </Box>
                        </Box>
                    </Box>
                </Box>

                <Box
                    sx={{
                        py: 6,
                        px: { xs: 2, md: 4 },
                        borderTop: "1px solid rgba(255,255,255,0.1)",
                    }}
                >
                    <Box sx={{ maxWidth: "1200px", margin: "0 auto" }}>
                        <Typography
                            variant="h4"
                            sx={{
                                textAlign: "center",
                                mb: 4,
                                fontWeight: 700,
                                color: "#fff",
                            }}
                        >
                            Thanks to the Community Building{" "}
                            <Box
                                component="span"
                                sx={{
                                    color: "#7AB8FF",
                                    fontStyle: "italic",
                                }}
                            >
                                pollinations.ai
                            </Box>
                        </Typography>

                        {loading ? (
                            <Box
                                sx={{
                                    textAlign: "center",
                                    color: "rgba(255,255,255,0.6)",
                                }}
                            >
                                Loading contributors...
                            </Box>
                        ) : error ? (
                            <Box
                                sx={{
                                    textAlign: "center",
                                    color: "rgba(255,255,255,0.6)",
                                }}
                            >
                                Unable to load contributors
                            </Box>
                        ) : (
                            <Box
                                sx={{
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    gap: 2,
                                    flexWrap: "wrap",
                                }}
                            >
                                {contributors.map((contributor, index) => (
                                    <motion.div
                                        key={contributor.id}
                                        variants={fadeInUp}
                                        initial="hidden"
                                        animate="visible"
                                        custom={index}
                                    >
                                        <Tooltip
                                            title={
                                                <Box
                                                    sx={{ textAlign: "center" }}
                                                >
                                                    <Typography
                                                        variant="body2"
                                                        sx={{ fontWeight: 600 }}
                                                    >
                                                        {contributor.login}
                                                    </Typography>
                                                    <Typography variant="caption">
                                                        {
                                                            contributor.contributions
                                                        }{" "}
                                                        contributions
                                                    </Typography>
                                                </Box>
                                            }
                                            arrow
                                            placement="top"
                                        >
                                            <Box
                                                component="a"
                                                href={contributor.html_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                sx={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    position: "relative",
                                                    marginLeft:
                                                        index > 0 ? "-12px" : 0,
                                                    zIndex:
                                                        contributors.length -
                                                        index,
                                                    transition: "all 0.3s ease",
                                                    cursor: "pointer",
                                                    "&:hover": {
                                                        transform:
                                                            "scale(1.15) translateY(-8px)",
                                                        zIndex: 100,
                                                        filter: "drop-shadow(0 8px 16px rgba(96, 165, 250, 0.4))",
                                                    },
                                                }}
                                            >
                                                {index ===
                                                contributors.length - 1 ? (
                                                    <Badge
                                                        badgeContent="+250"
                                                        sx={{
                                                            "& .MuiBadge-badge":
                                                                {
                                                                    backgroundColor:
                                                                        "#60a5fa",
                                                                    color: "#fff",
                                                                    fontWeight: 700,
                                                                    fontSize:
                                                                        "0.75rem",
                                                                    padding:
                                                                        "4px 6px",
                                                                    borderRadius:
                                                                        "6px",
                                                                    border: "2px solid #09090b",
                                                                },
                                                        }}
                                                    >
                                                        <Avatar
                                                            src={
                                                                contributor.avatar_url
                                                            }
                                                            alt={
                                                                contributor.login
                                                            }
                                                            sx={{
                                                                width: 60,
                                                                height: 60,
                                                                border: "3px solid #09090b",
                                                                backgroundColor:
                                                                    "#1a1a2e",
                                                                boxShadow:
                                                                    "0 4px 12px rgba(0, 0, 0, 0.3)",
                                                                transition:
                                                                    "all 0.3s ease",
                                                            }}
                                                        />
                                                    </Badge>
                                                ) : (
                                                    <Avatar
                                                        src={
                                                            contributor.avatar_url
                                                        }
                                                        alt={contributor.login}
                                                        sx={{
                                                            width: 60,
                                                            height: 60,
                                                            border: "3px solid #09090b",
                                                            backgroundColor:
                                                                "#1a1a2e",
                                                            boxShadow:
                                                                "0 4px 12px rgba(0, 0, 0, 0.3)",
                                                            transition:
                                                                "all 0.3s ease",
                                                        }}
                                                    />
                                                )}
                                            </Box>
                                        </Tooltip>
                                    </motion.div>
                                ))}
                            </Box>
                        )}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

export default HomePage;
