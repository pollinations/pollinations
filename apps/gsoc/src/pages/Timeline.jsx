import { Box, Paper, Typography, useMediaQuery, useTheme } from "@mui/material";
import { format, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { parseTimeline } from "../utils/parseTimeline";
import { colors, gradients } from "../theme";

const cardVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: "easeOut" },
    },
};

const TimelinePage = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const today = new Date();
    const currentPhaseRef = useRef(null);
    const [gsocTimeline, setGsocTimeline] = useState([]);

    useEffect(() => {
        document.title = "Timeline | GSoC × pollinations.ai";
        parseTimeline().then(setGsocTimeline);
    }, []);

    useEffect(() => {
        // Auto-scroll to current phase
        if (currentPhaseRef.current) {
            currentPhaseRef.current.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });
        }
    }, [gsocTimeline]);

    return (
        <Box
            sx={{
                minHeight: "100vh",
                bgcolor: colors.bg.deep,
                color: "#fff",
                padding: "2rem 2rem 4rem",
                position: "relative",
                overflow: "hidden",
            }}
        >
            <Box
                sx={{
                    position: "absolute",
                    top: "-10%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "600px",
                    height: "600px",
                    background:
                        "radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0) 70%)",
                    zIndex: 0,
                    pointerEvents: "none",
                }}
            />

            <Typography
                variant="h2"
                align="center"
                sx={{
                    marginBottom: "5rem",
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    background: gradients.textHeading,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    zIndex: 1,
                    position: "relative",
                }}
            >
                Timeline
            </Typography>

            <Typography
                variant="h6"
                align="center"
                sx={{
                    color: "rgba(255,255,255,0.7)",
                    fontWeight: 400,
                    maxWidth: "800px",
                    margin: "0 auto",
                    marginBottom: "3rem",
                    marginTop: "-4rem",
                    lineHeight: 1.6,
                    zIndex: 1,
                    position: "relative",
                }}
            >
                Key dates for GSoC 2026.
            </Typography>

            <Box
                sx={{
                    maxWidth: "1000px",
                    margin: "0 auto",
                    position: "relative",
                    zIndex: 1,
                }}
            >
                <Box
                    sx={{
                        position: "absolute",
                        left: isMobile ? "20px" : "50%",
                        top: 0,
                        bottom: 0,
                        width: "2px",
                        background:
                            "linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0.2) 10%, rgba(255,255,255,0.2) 90%, rgba(255,255,255,0))",
                        transform: isMobile ? "none" : "translateX(-50%)",
                    }}
                />

                {gsocTimeline.map((phase, index) => {
                    const startDate = parseISO(phase.startDate);
                    const endDate = parseISO(phase.endDate);
                    const isActive =
                        phase.isCurrent ||
                        (today >= startDate && today <= endDate);
                    const isPast = today > endDate;

                    return (
                        <motion.div
                            key={phase.title}
                            variants={cardVariants}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: "-100px" }}
                        >
                            <Box
                                sx={{
                                    display: "flex",
                                    justifyContent: isMobile
                                        ? "flex-start"
                                        : index % 2 === 0
                                          ? "flex-end"
                                          : "flex-start",
                                    position: "relative",
                                    mb: 6,
                                    pl: isMobile ? "60px" : 0,
                                }}
                                ref={isActive ? currentPhaseRef : null}
                            >
                                <Box
                                    sx={{
                                        position: "absolute",
                                        left: isMobile ? "20px" : "50%",
                                        top: "25px",
                                        width: "16px",
                                        height: "16px",
                                        borderRadius: "50%",
                                        bgcolor: isActive
                                            ? colors.lime.main
                                            : colors.bg.deep,
                                        border: "2px solid",
                                        borderColor: isActive
                                            ? "#fff"
                                            : isPast
                                              ? "rgba(255,255,255,0.5)"
                                              : "rgba(255,255,255,0.2)",
                                        transform: "translate(-50%, -50%)",
                                        zIndex: 2,
                                        boxShadow: isActive
                                            ? `0 0 20px ${colors.lime.glow}`
                                            : "none",
                                        transition: "all 0.3s ease",
                                    }}
                                />

                                <Paper
                                    elevation={0}
                                    sx={{
                                        width: isMobile ? "100%" : "45%",
                                        p: 3,
                                        background: isActive
                                            ? `linear-gradient(135deg, ${colors.lime.dim} 0%, rgba(163, 230, 53, 0.03) 100%)`
                                            : "rgba(255, 255, 255, 0.03)",
                                        backdropFilter: "blur(10px)",
                                        border: "2px solid",
                                        borderColor: isActive
                                            ? colors.lime.border
                                            : colors.border.light,
                                        borderRadius: "16px",
                                        transition: "all 0.3s ease",
                                        transform: isActive
                                            ? "scale(1.02)"
                                            : "scale(1)",
                                        boxShadow: isActive
                                            ? `0 8px 32px ${colors.lime.glow}, 0 0 0 1px ${colors.lime.border}`
                                            : "none",
                                        position: "relative",
                                        overflow: "visible",
                                        "&:hover": {
                                            borderColor: isActive
                                                ? colors.lime.main
                                                : colors.border.hover,
                                            background: isActive
                                                ? `linear-gradient(135deg, ${colors.lime.dim} 0%, rgba(163, 230, 53, 0.05) 100%)`
                                                : "rgba(255, 255, 255, 0.05)",
                                        },
                                    }}
                                >
                                    {/* Current badge - top right */}
                                    {isActive && (
                                        <Box
                                            sx={{
                                                position: "absolute",
                                                top: -12,
                                                right: 16,
                                                bgcolor: colors.lime.main,
                                                color: colors.bg.deep,
                                                px: 1.5,
                                                py: 0.5,
                                                borderRadius: "6px",
                                                fontSize: "11px",
                                                fontWeight: 700,
                                                letterSpacing: "0.05em",
                                                boxShadow: `0 4px 12px ${colors.lime.glow}`,
                                            }}
                                        >
                                            CURRENT
                                        </Box>
                                    )}
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            display: "inline-block",
                                            mb: 1.5,
                                            px: 1.5,
                                            py: 0.5,
                                            borderRadius: "8px",
                                            bgcolor: isActive
                                                ? colors.lime.dim
                                                : "transparent",
                                            border: "1px solid",
                                            borderColor: isActive
                                                ? colors.lime.border
                                                : colors.border.light,
                                            color: isActive
                                                ? colors.lime.main
                                                : "rgba(255,255,255,0.6)",
                                            fontFamily: "monospace",
                                            fontWeight: isActive ? 600 : 400,
                                        }}
                                    >
                                        {format(startDate, "MMM dd")} -{" "}
                                        {format(endDate, "MMM dd")}
                                    </Typography>

                                    <Typography
                                        variant="h5"
                                        sx={{
                                            fontWeight: isActive ? 700 : 600,
                                            mb: 1,
                                            color: isActive
                                                ? "#fff"
                                                : "#e4e4e7",
                                            textShadow: isActive
                                                ? "0 0 20px rgba(255,255,255,0.3)"
                                                : "none",
                                        }}
                                    >
                                        {phase.title}
                                    </Typography>

                                    <Typography
                                        variant="body2"
                                        sx={{
                                            color: isActive
                                                ? "#d1d5db"
                                                : "#a1a1aa",
                                            lineHeight: 1.6,
                                            fontWeight: isActive ? 500 : 400,
                                        }}
                                    >
                                        {phase.description}
                                    </Typography>
                                </Paper>
                            </Box>
                        </motion.div>
                    );
                })}
            </Box>
        </Box>
    );
};

export default TimelinePage;
