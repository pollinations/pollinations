import {
    ArrowForward,
    Assignment,
    Email,
    ExpandMore as ExpandMoreIcon,
    Lightbulb,
    Schedule,
} from "@mui/icons-material";
import {
    Alert,
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Collapse,
    Divider,
    IconButton,
    Snackbar,
    Stack,
    Typography,
} from "@mui/material";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import mentors from "../info/mentors.json";
import projects from "../info/projects.json";

const cardVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: (i) => ({
        opacity: 1,
        y: 0,
        transition: {
            delay: i * 0.1,
            duration: 0.5,
            ease: "easeOut",
        },
    }),
};

const ProjectsPage = () => {
    const [expanded, setExpanded] = useState(null);
    const [copyEmailToast, copyEmailAddress] = useState(false);
    const [submitApplicationToast, submitApplication] = useState(false);

    useEffect(() => {
        document.title = "Project Ideas - GSOC 2026 | pollinations.ai";
    }, []);

    const handleExpandClick = (projectId) => {
        setExpanded(expanded === projectId ? null : projectId);
    };

    const handleCopyEmail = () => {
        copyEmailAddress(false);
    };
    const handleApplicationButton = () => {
        submitApplication(false);
    };

    return (
        <Box
            sx={{
                minHeight: "100vh",
                bgcolor: "#09090b",
                padding: "2rem 2rem 4rem",
                position: "relative",
                overflow: "hidden",
            }}
        >
            <Box
                sx={{
                    maxWidth: "1400px",
                    margin: "0 auto",
                    position: "relative",
                    zIndex: 1,
                }}
            >
                <Box sx={{ textAlign: "center", mb: 6 }}>
                    <Typography
                        variant="h2"
                        sx={{
                            marginBottom: "1rem",
                            fontWeight: 700,
                            letterSpacing: "-0.02em",
                            background:
                                "linear-gradient(to bottom right, #fff, #a1a1aa)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                        }}
                    >
                        GSOC 2026 Project Ideas
                    </Typography>

                    <Typography
                        variant="h6"
                        sx={{
                            color: "rgba(255,255,255,0.7)",
                            fontWeight: 400,
                            maxWidth: "800px",
                            margin: "0 auto",
                            lineHeight: 1.6,
                        }}
                    >
                        Explore the ideas that we have penned for GSOC 2026.
                        Each project is designed to challenge and inspire you,
                        with mentorship from pollination developers to guide you
                        every step of the way.
                    </Typography>

                    <Stack
                        direction={{ xs: "column", md: "row" }}
                        spacing={4}
                        sx={{
                            mt: 4,
                            justifyContent: "center",
                            alignItems: "center",
                        }}
                    >
                        <Box sx={{ textAlign: "center" }}>
                            <Typography
                                variant="h4"
                                sx={{ color: "#fff", fontWeight: 700 }}
                            >
                                {projects.length}
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{
                                    color: "rgba(255,255,255,0.6)",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                }}
                            >
                                Active Projects
                            </Typography>
                        </Box>
                        <Box sx={{ textAlign: "center" }}>
                            <Typography
                                variant="h4"
                                sx={{ color: "#fff", fontWeight: 700 }}
                            >
                                3
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{
                                    color: "rgba(255,255,255,0.6)",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                }}
                            >
                                Categories
                            </Typography>
                        </Box>
                        <Box sx={{ textAlign: "center" }}>
                            <Typography
                                variant="h4"
                                sx={{ color: "#fff", fontWeight: 700 }}
                            >
                                20+
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{
                                    color: "rgba(255,255,255,0.6)",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                }}
                            >
                                Expected Applications
                            </Typography>
                        </Box>
                    </Stack>
                </Box>

                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(1, minmax(0, 2fr))",
                        gap: 2,
                        alignItems: "start",
                    }}
                >
                    {projects?.map((project, index) => {
                        const mentor = mentors.find(
                            (m) => m.id === project.mentorID,
                        );
                        return (
                            <motion.div
                                key={project.id}
                                custom={index}
                                variants={cardVariants}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                            >
                                <Card
                                    elevation={0}
                                    sx={{
                                        background:
                                            "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
                                        backdropFilter: "blur(20px)",
                                        width: "100%",
                                        display: "flex",
                                        flexDirection: "column",
                                        height: "100%",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "20px",
                                        color: "#fff",
                                        transition: "all 0.4s ease",
                                        position: "relative",
                                        marginBottom: "25px",
                                        "&:hover": {
                                            transform: "translateY(-4px)",
                                            borderColor:
                                                "rgba(255,255,255,0.3)",
                                            boxShadow:
                                                "0 25px 50px -10px rgba(0,0,0,0.5)",
                                        },
                                        "&::before": {
                                            content: '""',
                                            position: "absolute",
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            height: "4px",
                                            borderRadius: "20px 20px 0 0",
                                            background: `linear-gradient(90deg, ${project.category === "AI/ML" ? "#f59e0b, #d97706" : project.category === "Data Visualization" ? "#3b82f6, #1d4ed8" : project.category === "Web Development" ? "#ec4899, #be185d" : project.category === "Game Dev" ? "#a855f7, #7e22ce" : "#10b981, #059669"})`,
                                        },
                                    }}
                                >
                                    <CardContent
                                        sx={{
                                            padding: "2.5rem",
                                            display: "flex",
                                            flexDirection: "column",
                                            flex: 1,
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                display: "flex",
                                                flexDirection: {
                                                    xs: "column",
                                                    lg: "row",
                                                },
                                                gap: 3,
                                            }}
                                        >
                                            <Box sx={{ flex: 1 }}>
                                                <Box
                                                    sx={{
                                                        display: "flex",
                                                        gap: 2,
                                                        alignItems: "center",
                                                        mb: 3,
                                                    }}
                                                >
                                                    <Chip
                                                        label={project.category}
                                                        size="medium"
                                                        icon={
                                                            <Lightbulb
                                                                sx={{
                                                                    fontSize:
                                                                        "18px !important",
                                                                }}
                                                            />
                                                        }
                                                        sx={{
                                                            bgcolor:
                                                                project.category ===
                                                                "AI/ML"
                                                                    ? "rgba(245, 158, 11, 0.1)"
                                                                    : project.category ===
                                                                        "Data Visualization"
                                                                      ? "rgba(59, 130, 246, 0.1)"
                                                                      : project.category ===
                                                                          "Web Development"
                                                                        ? "rgba(236, 72, 153, 0.1)"
                                                                        : project.category ===
                                                                            "Game Dev"
                                                                          ? "rgba(168, 85, 247, 0.1)"
                                                                          : "rgba(16, 185, 129, 0.1)",
                                                            color:
                                                                project.category ===
                                                                "AI/ML"
                                                                    ? "#fbbf24"
                                                                    : project.category ===
                                                                        "Data Visualization"
                                                                      ? "#60a5fa"
                                                                      : project.category ===
                                                                          "Web Development"
                                                                        ? "#ec4899"
                                                                        : project.category ===
                                                                            "Game Dev"
                                                                          ? "#d8b4fe"
                                                                          : "#34d399",
                                                            border: `1px solid ${
                                                                project.category ===
                                                                "AI/ML"
                                                                    ? "rgba(245, 158, 11, 0.3)"
                                                                    : project.category ===
                                                                        "Data Visualization"
                                                                      ? "rgba(59, 130, 246, 0.3)"
                                                                      : project.category ===
                                                                          "Web Development"
                                                                        ? "rgba(236, 72, 153, 0.3)"
                                                                        : project.category ===
                                                                            "Game Dev"
                                                                          ? "rgba(168, 85, 247, 0.3)"
                                                                          : "rgba(16, 185, 129, 0.3)"
                                                            }`,
                                                            fontWeight: 600,
                                                            fontSize:
                                                                "0.875rem",
                                                            height: "32px",
                                                        }}
                                                    />
                                                    <Chip
                                                        label={
                                                            project.difficulty
                                                        }
                                                        size="medium"
                                                        sx={{
                                                            bgcolor:
                                                                project.difficulty ===
                                                                "Beginner"
                                                                    ? "rgba(34, 197, 94, 0.1)"
                                                                    : project.difficulty ===
                                                                        "Intermediate"
                                                                      ? "rgba(251, 191, 36, 0.1)"
                                                                      : "rgba(239, 68, 68, 0.1)",
                                                            color:
                                                                project.difficulty ===
                                                                "Beginner"
                                                                    ? "#4ade80"
                                                                    : project.difficulty ===
                                                                        "Intermediate"
                                                                      ? "#fbbf24"
                                                                      : "#f87171",
                                                            border: `1px solid ${project.difficulty === "Beginner" ? "rgba(34, 197, 94, 0.3)" : project.difficulty === "Intermediate" ? "rgba(251, 191, 36, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                                                            fontWeight: 600,
                                                            fontSize:
                                                                "0.875rem",
                                                            height: "32px",
                                                        }}
                                                    />
                                                    <Chip
                                                        label={project.duration}
                                                        size="medium"
                                                        icon={
                                                            <Schedule
                                                                sx={{
                                                                    fontSize:
                                                                        "18px !important",
                                                                }}
                                                            />
                                                        }
                                                        sx={{
                                                            bgcolor:
                                                                "rgba(156, 163, 175, 0.1)",
                                                            color: "#d1d5db",
                                                            border: "1px solid rgba(156, 163, 175, 0.2)",
                                                            fontWeight: 600,
                                                            fontSize:
                                                                "0.875rem",
                                                            height: "32px",
                                                        }}
                                                    />
                                                </Box>

                                                <Typography
                                                    variant="h4"
                                                    sx={{
                                                        fontWeight: 700,
                                                        mb: 2,
                                                        lineHeight: 1.2,
                                                        color: "#fff",
                                                        fontSize: {
                                                            xs: "1.75rem",
                                                            md: "2rem",
                                                        },
                                                    }}
                                                >
                                                    {project.title}
                                                </Typography>

                                                <Typography
                                                    variant="body1"
                                                    sx={{
                                                        color: "rgba(255,255,255,0.8)",
                                                        lineHeight: 1.7,
                                                        mb: 3,
                                                        fontSize: "1.1rem",
                                                    }}
                                                >
                                                    {project.description}
                                                </Typography>

                                                <Box sx={{ mb: 3 }}>
                                                    <Stack
                                                        direction="row"
                                                        flexWrap="wrap"
                                                        gap={1.5}
                                                    >
                                                        {project.technologies.map(
                                                            (tech) => (
                                                                <Chip
                                                                    label={tech}
                                                                    key={tech}
                                                                    size="medium"
                                                                    sx={{
                                                                        fontSize:
                                                                            "0.85rem",
                                                                        height: "28px",
                                                                        background:
                                                                            "rgba(255,255,255,0.1)",
                                                                        color: "#f3f4f6",
                                                                        border: "1px solid rgba(255,255,255,0.2)",
                                                                        fontWeight: 500,
                                                                        "&:hover":
                                                                            {
                                                                                background:
                                                                                    "rgba(255,255,255,0.2)",
                                                                                transform:
                                                                                    "translateY(-1px)",
                                                                                boxShadow:
                                                                                    "0 4px 12px rgba(0,0,0,0.3)",
                                                                            },
                                                                    }}
                                                                />
                                                            ),
                                                        )}
                                                    </Stack>
                                                </Box>
                                            </Box>

                                            <Box
                                                sx={{
                                                    display: {
                                                        xs: "none",
                                                        lg: "block",
                                                    },
                                                    position: "relative",
                                                    width: "1px",
                                                }}
                                            >
                                                <Box
                                                    sx={{
                                                        position: "absolute",
                                                        left: "50%",
                                                        top: 0,
                                                        bottom: 0,
                                                        width: "2px",
                                                        background:
                                                            "linear-gradient(90deg,  rgba(96, 165, 250, 0.1) 50%, rgba(96, 165, 250, 0.5) 0%,rgba(96, 165, 250, 0) 100%)",
                                                        transform:
                                                            "translateX(-50%)",
                                                    }}
                                                />
                                            </Box>

                                            <Box
                                                sx={{
                                                    flex: 1,
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    justifyContent: "center",
                                                    alignItems: "center",
                                                    textAlign: "center",
                                                    paddingTop: {
                                                        xs: 0,
                                                        lg: 3,
                                                    },
                                                }}
                                            >
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        color: "rgba(255,255,255,0.6)",
                                                        textTransform:
                                                            "uppercase",
                                                        letterSpacing: "0.5px",
                                                        fontWeight: 600,
                                                        mb: 2,
                                                        display: "block",
                                                    }}
                                                >
                                                    Project Mentor
                                                </Typography>

                                                <Box
                                                    sx={{
                                                        display: "flex",
                                                        flexDirection: {
                                                            xs: "row",
                                                            lg: "column",
                                                        },
                                                        alignItems: {
                                                            xs: "center",
                                                            lg: "center",
                                                        },
                                                        gap: 2,
                                                        mb: 2,
                                                    }}
                                                >
                                                    <Avatar
                                                        src={mentor?.imageUrl}
                                                        sx={{
                                                            width: {
                                                                xs: 65,
                                                                lg: 80,
                                                            },
                                                            height: {
                                                                xs: 65,
                                                                lg: 80,
                                                            },
                                                            border: "2px solid rgba(255,255,255,0.2)",
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        {mentor?.name
                                                            ?.split(" ")
                                                            .map((n) => n[0])
                                                            .join("") || "M"}
                                                    </Avatar>
                                                    <Box
                                                        sx={{
                                                            display: "flex",
                                                            flexDirection:
                                                                "column",
                                                            gap: 1,
                                                        }}
                                                    >
                                                        <Typography
                                                            variant="h6"
                                                            onClick={() =>
                                                                location.replace(
                                                                    "/mentors",
                                                                )
                                                            }
                                                            sx={{
                                                                color: "#fff",
                                                                fontWeight: 600,
                                                                textDecoration:
                                                                    "underline",
                                                                userSelect:
                                                                    "none",
                                                                cursor: "pointer",
                                                                fontSize: {
                                                                    xs: "0.9rem",
                                                                    lg: "1.1rem",
                                                                },
                                                            }}
                                                        >
                                                            {mentor?.name ||
                                                                "TBA"}
                                                        </Typography>
                                                        <Typography
                                                            variant="caption"
                                                            sx={{
                                                                color: "rgba(255,255,255,0.7)",
                                                            }}
                                                        >
                                                            {mentor?.email && (
                                                                <IconButton
                                                                    component="p"
                                                                    onClick={async () => {
                                                                        await navigator.clipboard.writeText(
                                                                            mentor.email,
                                                                        );
                                                                        copyEmailAddress(
                                                                            true,
                                                                        );
                                                                    }}
                                                                    size="small"
                                                                    sx={{
                                                                        color: "rgba(255,255,255,0.7)",
                                                                        display:
                                                                            "flex",
                                                                        width: "fit-content",
                                                                        flexDirection:
                                                                            "row",
                                                                        alignItems:
                                                                            "center",
                                                                        gap: 0.5,
                                                                        fontSize:
                                                                            "0.75rem",
                                                                        px: "12px",
                                                                        py: "6px",
                                                                        justifyContent:
                                                                            "flex-start",
                                                                        border: "1px solid rgba(255,255,255,0.15)",
                                                                        borderRadius:
                                                                            "25px",
                                                                        "&:hover":
                                                                            {
                                                                                color: "#e9d5ff",
                                                                                backgroundColor:
                                                                                    "rgba(168, 85, 247, 0.15)",
                                                                            },
                                                                    }}
                                                                >
                                                                    <Email
                                                                        sx={{
                                                                            fontSize:
                                                                                "16px",
                                                                        }}
                                                                    />{" "}
                                                                    {
                                                                        mentor?.email
                                                                    }
                                                                </IconButton>
                                                            )}
                                                        </Typography>
                                                    </Box>
                                                </Box>
                                            </Box>
                                        </Box>
                                        <Collapse
                                            in={expanded === project.id}
                                            timeout={600}
                                            sx={{
                                                "& .MuiCollapse-wrapper": {
                                                    transition:
                                                        "all 0.6s cubic-bezier(0.4, 0, 0.2, 1) !important",
                                                },
                                            }}
                                        >
                                            <motion.div
                                                initial={{
                                                    opacity: 0,
                                                    y: -20,
                                                }}
                                                animate={{
                                                    opacity:
                                                        expanded === project.id
                                                            ? 1
                                                            : 0,
                                                    y:
                                                        expanded === project.id
                                                            ? 0
                                                            : -20,
                                                }}
                                                transition={{
                                                    duration: 0.4,
                                                    delay: 0.1,
                                                }}
                                            >
                                                <Divider
                                                    sx={{
                                                        my: 4,
                                                        borderColor:
                                                            "rgba(255,255,255,0.1)",
                                                    }}
                                                />

                                                <div className="flex flex-col lg:flex-row gap-8">
                                                    <div className="w-full lg:w-2/3">
                                                        <Typography
                                                            variant="h5"
                                                            sx={{
                                                                color: "#fff",
                                                                fontWeight: 600,
                                                                mb: 3,
                                                                display: "flex",
                                                                alignItems:
                                                                    "center",
                                                                gap: 1,
                                                            }}
                                                        >
                                                            <Assignment
                                                                sx={{
                                                                    fontSize:
                                                                        "24px",
                                                                }}
                                                            />
                                                            Detailed Project
                                                            Description
                                                        </Typography>

                                                        <Typography
                                                            variant="body1"
                                                            sx={{
                                                                color: "rgba(255,255,255,0.9)",
                                                                lineHeight: 1.8,
                                                                mb: 4,
                                                                fontSize:
                                                                    "1.1rem",
                                                            }}
                                                        >
                                                            {
                                                                project.longDescription
                                                            }
                                                        </Typography>

                                                        <Stack
                                                            direction={{
                                                                xs: "column",
                                                                sm: "row",
                                                            }}
                                                            spacing={2}
                                                        >
                                                            <Button
                                                                variant="outlined"
                                                                endIcon={
                                                                    <ArrowForward />
                                                                }
                                                                size="large"
                                                                sx={{
                                                                    borderColor:
                                                                        "rgba(255,255,255,0.2)",
                                                                    color: "rgba(255,255,255,0.8)",
                                                                    textTransform:
                                                                        "none",
                                                                    py: 1.5,
                                                                    px: 3,
                                                                    "&:hover": {
                                                                        borderColor:
                                                                            "rgba(255,255,255,0.4)",
                                                                        color: "#fff",
                                                                        backgroundColor:
                                                                            "rgba(255,255,255,0.05)",
                                                                    },
                                                                }}
                                                            >
                                                                Documentation
                                                            </Button>
                                                            <Button
                                                                variant="outlined"
                                                                endIcon={
                                                                    <Assignment />
                                                                }
                                                                size="large"
                                                                href="/contributing"
                                                                target="_blank"
                                                                sx={{
                                                                    borderColor:
                                                                        "rgba(34, 197, 94, 0.3)",
                                                                    color: "#4ade80",
                                                                    textTransform:
                                                                        "none",
                                                                    py: 1.5,
                                                                    px: 3,
                                                                    "&:hover": {
                                                                        borderColor:
                                                                            "rgba(34, 197, 94, 0.5)",
                                                                        color: "#22c55e",
                                                                        backgroundColor:
                                                                            "rgba(34, 197, 94, 0.05)",
                                                                    },
                                                                }}
                                                            >
                                                                Contributing
                                                                Guide
                                                            </Button>
                                                            <Button
                                                                variant="outlined"
                                                                size="large"
                                                                onClick={() =>
                                                                    submitApplication(
                                                                        true,
                                                                    )
                                                                }
                                                                sx={{
                                                                    borderColor:
                                                                        "rgba(59, 130, 246, 0.3)",
                                                                    color: "#60a5fa",
                                                                    textTransform:
                                                                        "none",
                                                                    py: 1.5,
                                                                    px: 3,
                                                                    fontWeight: 600,
                                                                    "&:hover": {
                                                                        borderColor:
                                                                            "rgba(59, 130, 246, 0.5)",
                                                                        color: "#3b82f6",
                                                                        backgroundColor:
                                                                            "rgba(59, 130, 246, 0.05)",
                                                                    },
                                                                }}
                                                            >
                                                                Apply for this
                                                                Project
                                                            </Button>
                                                        </Stack>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        </Collapse>

                                        <IconButton
                                            onClick={() =>
                                                handleExpandClick(project.id)
                                            }
                                            sx={{
                                                color: "rgba(255,255,255,0.8)",
                                                border: "1px solid rgba(255,255,255,0.2)",
                                                borderRadius: "15px",
                                                margin: "2rem auto 0",
                                                width: "100%",
                                                height: "48px",
                                                display: "flex",
                                                alignItems: "center",
                                                bottom: "15px",
                                                justifyContent: "center",
                                                "&:hover": {
                                                    borderColor:
                                                        "rgba(255,255,255,0.4)",
                                                    color: "#fff",
                                                    backgroundColor:
                                                        "rgba(255,255,255,0.05)",
                                                },
                                            }}
                                        >
                                            <Typography>
                                                Interested? View Details
                                            </Typography>
                                            <ExpandMoreIcon
                                                sx={{
                                                    transform:
                                                        expanded === project.id
                                                            ? "rotate(180deg)"
                                                            : "rotate(0deg)",
                                                    transition:
                                                        "transform 0.3s ease",
                                                }}
                                            />
                                        </IconButton>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        );
                    })}
                </Box>
            </Box>
            <Snackbar
                open={submitApplicationToast}
                autoHideDuration={3000}
                onClose={handleApplicationButton}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    onClose={handleApplicationButton}
                    severity="success"
                    sx={{ width: "100%" }}
                >
                    Contributor applications are yet to open. Check Timeline!
                </Alert>
            </Snackbar>
            <Snackbar
                open={copyEmailToast}
                autoHideDuration={3000}
                onClose={handleCopyEmail}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    onClose={handleCopyEmail}
                    severity="success"
                    sx={{ width: "100%" }}
                >
                    Email Address Copied to Clipboard!
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default ProjectsPage;
