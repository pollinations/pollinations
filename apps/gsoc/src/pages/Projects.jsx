import { Email, Lightbulb, OpenInNew, Schedule } from "@mui/icons-material";
import {
    Alert,
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    IconButton,
    Snackbar,
    Stack,
    Typography,
} from "@mui/material";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import mentors from "../info/mentors.json";
import projects from "../info/projects.json";
import { colors, getCategoryColor, gradients } from "../theme";

const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.3,
            ease: "easeOut",
        },
    },
};

const ProjectsPage = () => {
    const [copyEmailToast, setCopyEmailToast] = useState(false);
    const [submitApplicationToast, setSubmitApplicationToast] = useState(false);

    useEffect(() => {
        document.title = "Projects | GSoC × pollinations.ai";
    }, []);

    const truncateDescription = (text, maxSentences = 3) => {
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        return sentences.slice(0, maxSentences).join(" ");
    };

    // getCategoryColor and getDifficultyColor imported from theme.js

    return (
        <Box
            sx={{
                minHeight: "100vh",
                bgcolor: colors.bg.deep,
                padding: "2rem 2rem 4rem",
                position: "relative",
                overflow: "hidden",
            }}
        >
            <Box
                sx={{
                    maxWidth: "1200px",
                    margin: "0 auto",
                    position: "relative",
                    zIndex: 1,
                }}
            >
                {/* Header */}
                <Box sx={{ textAlign: "center", mb: 4 }}>
                    <Typography
                        variant="h2"
                        sx={{
                            marginBottom: "0.5rem",
                            fontWeight: 700,
                            letterSpacing: "-0.02em",
                            background: gradients.textHeading,
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                        }}
                    >
                        GSoC 2026 Project Ideas
                    </Typography>

                    <Typography
                        variant="caption"
                        sx={{
                            color: "rgba(255,255,255,0.4)",
                            display: "block",
                            mb: 2,
                        }}
                    >
                        Last updated: January 2025
                    </Typography>

                    <Typography
                        variant="body1"
                        sx={{
                            color: "rgba(255,255,255,0.7)",
                            maxWidth: "800px",
                            margin: "0 auto",
                            lineHeight: 1.7,
                            mb: 3,
                        }}
                    >
                        pollinations.ai is an open-source generative AI platform
                        powering 500+ community projects with text, image,
                        video, and audio generation APIs. For GSoC, you'll work
                        on real product features inside the pollinations.ai
                        ecosystem.
                    </Typography>
                </Box>

                {/* We're excited to work with you */}
                <Box
                    sx={{
                        maxWidth: "800px",
                        margin: "0 auto",
                        mb: 4,
                        p: 3,
                        borderRadius: "12px",
                        bgcolor: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                    }}
                >
                    <Typography
                        variant="h6"
                        sx={{
                            color: "#fff",
                            fontWeight: 600,
                            mb: 2,
                        }}
                    >
                        We're excited to work with you! 🌱
                    </Typography>
                    <Box
                        component="ul"
                        sx={{
                            color: "rgba(255,255,255,0.7)",
                            pl: 2.5,
                            m: 0,
                            "& li": { mb: 1, lineHeight: 1.6 },
                        }}
                    >
                        <li>
                            <strong style={{ color: "#fff" }}>
                                Say hi early
                            </strong>{" "}
                            — Join our Discord, introduce yourself, and share
                            your ideas. We love helping you shape a great
                            proposal.
                        </li>
                        <li>
                            <strong style={{ color: "#fff" }}>
                                Start small, dream big
                            </strong>{" "}
                            — Focus on a solid MVP first; stretch goals make the
                            journey even better.
                        </li>
                        <li>
                            <strong style={{ color: "#fff" }}>
                                Stay in touch
                            </strong>{" "}
                            — Regular check-ins help us support you. We're a
                            team!
                        </li>
                    </Box>
                    <Typography
                        variant="body2"
                        sx={{
                            color: "rgba(255,255,255,0.5)",
                            mt: 2,
                            fontSize: "0.85rem",
                        }}
                    >
                        <strong>Project sizes:</strong> Small ≈ 90h • Medium ≈
                        175h • Large ≈ 350h
                    </Typography>
                </Box>

                {/* Essential Links */}
                <Box
                    sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "center",
                        gap: 1.5,
                        mb: 5,
                    }}
                >
                    <Button
                        variant="contained"
                        href="https://pollinations.ai"
                        target="_blank"
                        startIcon={
                            <img
                                src="/polli_white.svg"
                                alt=""
                                style={{ width: 18, height: 18 }}
                            />
                        }
                        sx={{
                            bgcolor: "rgba(255,255,255,0.1)",
                            color: "#fff",
                            textTransform: "none",
                            fontWeight: 600,
                            border: "1px solid rgba(255,255,255,0.2)",
                            "&:hover": {
                                bgcolor: "rgba(255,255,255,0.15)",
                            },
                        }}
                    >
                        pollinations.ai
                    </Button>
                    <Button
                        variant="contained"
                        href="https://discord.gg/pollinations-ai-885844321461485618"
                        target="_blank"
                        startIcon={
                            <img
                                src="/discord.svg"
                                alt=""
                                style={{ width: 18, height: 18 }}
                            />
                        }
                        sx={{
                            bgcolor: "rgba(88, 101, 242, 0.15)",
                            color: "#818cf8",
                            textTransform: "none",
                            fontWeight: 600,
                            border: "1px solid rgba(88, 101, 242, 0.3)",
                            "&:hover": {
                                bgcolor: "rgba(88, 101, 242, 0.25)",
                            },
                        }}
                    >
                        Join Discord
                    </Button>
                    <Button
                        variant="outlined"
                        href="https://github.com/pollinations/pollinations"
                        target="_blank"
                        startIcon={
                            <img
                                src="/github.svg"
                                alt=""
                                style={{
                                    width: 18,
                                    height: 18,
                                    filter: "invert(1)",
                                }}
                            />
                        }
                        sx={{
                            borderColor: "rgba(255,255,255,0.2)",
                            color: "rgba(255,255,255,0.8)",
                            textTransform: "none",
                            fontWeight: 600,
                            "&:hover": {
                                borderColor: "rgba(255,255,255,0.4)",
                                bgcolor: "rgba(255,255,255,0.05)",
                            },
                        }}
                    >
                        Our Repository
                    </Button>
                    <Button
                        variant="outlined"
                        href="/contributing"
                        startIcon={<OpenInNew sx={{ fontSize: 16 }} />}
                        sx={{
                            borderColor: "rgba(34, 197, 94, 0.3)",
                            color: "#4ade80",
                            textTransform: "none",
                            fontWeight: 600,
                            "&:hover": {
                                borderColor: "rgba(34, 197, 94, 0.5)",
                                bgcolor: "rgba(34, 197, 94, 0.05)",
                            },
                        }}
                    >
                        Contributing Guide
                    </Button>
                    <Button
                        variant="outlined"
                        href="https://developers.google.com/open-source/gsoc/faq"
                        target="_blank"
                        startIcon={
                            <img
                                src="/gsoc_logo.webp"
                                alt=""
                                style={{ width: 18, height: 18 }}
                            />
                        }
                        sx={{
                            borderColor: "rgba(251, 191, 36, 0.3)",
                            color: "#fbbf24",
                            textTransform: "none",
                            fontWeight: 600,
                            "&:hover": {
                                borderColor: "rgba(251, 191, 36, 0.5)",
                                bgcolor: "rgba(251, 191, 36, 0.05)",
                            },
                        }}
                    >
                        GSoC FAQ
                    </Button>
                    <Button
                        variant="outlined"
                        href="https://google.github.io/gsocguides/student/writing-a-proposal"
                        target="_blank"
                        startIcon={
                            <img
                                src="/gsoc_logo.webp"
                                alt=""
                                style={{ width: 18, height: 18 }}
                            />
                        }
                        sx={{
                            borderColor: "rgba(251, 191, 36, 0.3)",
                            color: "#fbbf24",
                            textTransform: "none",
                            fontWeight: 600,
                            "&:hover": {
                                borderColor: "rgba(251, 191, 36, 0.5)",
                                bgcolor: "rgba(251, 191, 36, 0.05)",
                            },
                        }}
                    >
                        Writing a Proposal
                    </Button>
                </Box>

                {/* Project Cards */}
                <Stack spacing={3}>
                    {projects?.map((project) => {
                        const mentor = mentors.find(
                            (m) => m.id === project.mentorID,
                        );
                        const categoryColor = getCategoryColor(
                            project.category,
                        );

                        return (
                            <motion.div
                                key={project.id}
                                variants={cardVariants}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, amount: 0.1 }}
                            >
                                <Card
                                    elevation={0}
                                    sx={{
                                        background:
                                            "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
                                        backdropFilter: "blur(20px)",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "16px",
                                        color: "#fff",
                                        transition: "all 0.3s ease",
                                        position: "relative",
                                        overflow: "hidden",
                                        "&:hover": {
                                            transform: "translateY(-2px)",
                                            borderColor:
                                                "rgba(255,255,255,0.2)",
                                            boxShadow:
                                                "0 20px 40px -10px rgba(0,0,0,0.4)",
                                        },
                                        "&::before": {
                                            content: '""',
                                            position: "absolute",
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            height: "4px",
                                            background: `linear-gradient(90deg, ${categoryColor.text}, ${categoryColor.border})`,
                                        },
                                    }}
                                >
                                    <CardContent sx={{ padding: "1.5rem" }}>
                                        {/* Two-column layout */}
                                        <Box
                                            sx={{
                                                display: "flex",
                                                gap: 3,
                                                flexDirection: {
                                                    xs: "column",
                                                    md: "row",
                                                },
                                                alignItems: {
                                                    xs: "center",
                                                    md: "flex-start",
                                                },
                                            }}
                                        >
                                            {/* Left: All content */}
                                            <Box
                                                sx={{
                                                    flex: 1,
                                                    minWidth: 0,
                                                    textAlign: {
                                                        xs: "center",
                                                        md: "left",
                                                    },
                                                }}
                                            >
                                                <Typography
                                                    variant="h5"
                                                    sx={{
                                                        fontWeight: 700,
                                                        lineHeight: 1.3,
                                                        color: "#fff",
                                                        mb: 1.5,
                                                    }}
                                                >
                                                    {project.title}
                                                </Typography>

                                                {/* Chips */}
                                                <Stack
                                                    direction="row"
                                                    spacing={1}
                                                    flexWrap="wrap"
                                                    sx={{
                                                        mb: 1.5,
                                                        gap: 1,
                                                        justifyContent: {
                                                            xs: "center",
                                                            md: "flex-start",
                                                        },
                                                    }}
                                                >
                                                    <Chip
                                                        label={project.category}
                                                        size="small"
                                                        icon={
                                                            <Lightbulb
                                                                sx={{
                                                                    fontSize:
                                                                        "14px !important",
                                                                }}
                                                            />
                                                        }
                                                        sx={{
                                                            bgcolor:
                                                                categoryColor.bg,
                                                            color: categoryColor.text,
                                                            border: `1px solid ${categoryColor.border}`,
                                                            fontWeight: 500,
                                                            fontSize: "0.75rem",
                                                        }}
                                                    />
                                                    <Chip
                                                        label={
                                                            project.difficulty
                                                        }
                                                        size="small"
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
                                                            border: `1px solid ${
                                                                project.difficulty ===
                                                                "Beginner"
                                                                    ? "rgba(34, 197, 94, 0.3)"
                                                                    : project.difficulty ===
                                                                        "Intermediate"
                                                                      ? "rgba(251, 191, 36, 0.3)"
                                                                      : "rgba(239, 68, 68, 0.3)"
                                                            }`,
                                                            fontWeight: 500,
                                                            fontSize: "0.75rem",
                                                        }}
                                                    />
                                                    <Chip
                                                        label={project.duration}
                                                        size="small"
                                                        icon={
                                                            <Schedule
                                                                sx={{
                                                                    fontSize:
                                                                        "14px !important",
                                                                }}
                                                            />
                                                        }
                                                        sx={{
                                                            bgcolor:
                                                                "rgba(156, 163, 175, 0.1)",
                                                            color: "#d1d5db",
                                                            border: "1px solid rgba(156, 163, 175, 0.2)",
                                                            fontWeight: 500,
                                                            fontSize: "0.75rem",
                                                        }}
                                                    />
                                                </Stack>

                                                {/* Description */}
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: "rgba(255,255,255,0.8)",
                                                        lineHeight: 1.7,
                                                        mb: 1.5,
                                                    }}
                                                >
                                                    {truncateDescription(
                                                        project.longDescription,
                                                    )}
                                                </Typography>

                                                {/* Technologies */}
                                                <Stack
                                                    direction="row"
                                                    flexWrap="wrap"
                                                    gap={0.75}
                                                    sx={{
                                                        mb: 2,
                                                        justifyContent: {
                                                            xs: "center",
                                                            md: "flex-start",
                                                        },
                                                    }}
                                                >
                                                    {project.technologies.map(
                                                        (tech) => (
                                                            <Chip
                                                                label={tech}
                                                                key={tech}
                                                                size="small"
                                                                sx={{
                                                                    fontSize:
                                                                        "0.7rem",
                                                                    height: "24px",
                                                                    background:
                                                                        "rgba(255,255,255,0.08)",
                                                                    color: "#e5e7eb",
                                                                    border: "1px solid rgba(255,255,255,0.1)",
                                                                    fontWeight: 500,
                                                                }}
                                                            />
                                                        ),
                                                    )}
                                                </Stack>

                                                {/* Buttons */}
                                                <Stack
                                                    direction="row"
                                                    spacing={1.5}
                                                    sx={{
                                                        justifyContent: {
                                                            xs: "center",
                                                            md: "flex-start",
                                                        },
                                                    }}
                                                >
                                                    <Button
                                                        variant="contained"
                                                        size="small"
                                                        onClick={() =>
                                                            setSubmitApplicationToast(
                                                                true,
                                                            )
                                                        }
                                                        sx={{
                                                            bgcolor:
                                                                colors.lime.dim,
                                                            color: colors.lime
                                                                .main,
                                                            textTransform:
                                                                "none",
                                                            fontWeight: 600,
                                                            border: `1px solid ${colors.lime.border}`,
                                                            "&:hover": {
                                                                bgcolor:
                                                                    colors.lime
                                                                        .border,
                                                                borderColor:
                                                                    colors.lime
                                                                        .glow,
                                                            },
                                                        }}
                                                    >
                                                        Apply to this project
                                                    </Button>
                                                    <Button
                                                        variant="outlined"
                                                        size="small"
                                                        endIcon={
                                                            <OpenInNew
                                                                sx={{
                                                                    fontSize:
                                                                        "14px",
                                                                }}
                                                            />
                                                        }
                                                        href="https://github.com/pollinations/pollinations/blob/main/apps/gsoc/public/GSOC/IDEAS.md"
                                                        target="_blank"
                                                        sx={{
                                                            borderColor:
                                                                "rgba(255,255,255,0.2)",
                                                            color: "rgba(255,255,255,0.7)",
                                                            textTransform:
                                                                "none",
                                                            "&:hover": {
                                                                borderColor:
                                                                    "rgba(255,255,255,0.4)",
                                                                color: "#fff",
                                                                bgcolor:
                                                                    "rgba(255,255,255,0.05)",
                                                            },
                                                        }}
                                                    >
                                                        Learn More
                                                    </Button>
                                                </Stack>
                                            </Box>

                                            {/* Right: Mentor (fixed width) */}
                                            <Box
                                                sx={{
                                                    flexShrink: 0,
                                                    width: "280px",
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    alignItems: "center",
                                                    gap: 1.5,
                                                    p: 2.5,
                                                    borderRadius: "12px",
                                                    bgcolor:
                                                        "rgba(255,255,255,0.03)",
                                                    border: "1px solid rgba(255,255,255,0.08)",
                                                    alignSelf: {
                                                        xs: "center",
                                                        md: "flex-start",
                                                    },
                                                }}
                                            >
                                                <Chip
                                                    label="Mentor"
                                                    size="small"
                                                    sx={{
                                                        bgcolor:
                                                            "rgba(168, 85, 247, 0.15)",
                                                        color: "#d8b4fe",
                                                        border: "1px solid rgba(168, 85, 247, 0.3)",
                                                        fontWeight: 600,
                                                        fontSize: "0.75rem",
                                                        height: "24px",
                                                    }}
                                                />
                                                <Avatar
                                                    src={mentor?.imageUrl}
                                                    sx={{
                                                        width: 72,
                                                        height: 72,
                                                        border: "2px solid rgba(168, 85, 247, 0.3)",
                                                    }}
                                                >
                                                    {mentor?.name
                                                        ?.split(" ")
                                                        .map((n) => n[0])
                                                        .join("") || "M"}
                                                </Avatar>
                                                <Typography
                                                    variant="body1"
                                                    sx={{
                                                        color: "#fff",
                                                        fontWeight: 600,
                                                        fontSize: "1.05rem",
                                                        textAlign: "center",
                                                    }}
                                                >
                                                    {mentor?.name || "TBA"}
                                                </Typography>
                                                {mentor?.email && (
                                                    <IconButton
                                                        size="small"
                                                        onClick={async () => {
                                                            await navigator.clipboard.writeText(
                                                                mentor.email,
                                                            );
                                                            setCopyEmailToast(
                                                                true,
                                                            );
                                                        }}
                                                        sx={{
                                                            color: "rgba(255,255,255,0.5)",
                                                            display: "flex",
                                                            alignItems:
                                                                "center",
                                                            gap: 0.75,
                                                            px: 1.25,
                                                            py: 0.75,
                                                            borderRadius: "8px",
                                                            border: "1px solid rgba(255,255,255,0.1)",
                                                            "&:hover": {
                                                                color: "#7AB8FF",
                                                                borderColor:
                                                                    "rgba(122, 184, 255, 0.3)",
                                                                bgcolor:
                                                                    "rgba(122, 184, 255, 0.1)",
                                                            },
                                                        }}
                                                    >
                                                        <Email
                                                            sx={{
                                                                fontSize:
                                                                    "16px",
                                                            }}
                                                        />
                                                        <Typography
                                                            sx={{
                                                                fontSize:
                                                                    "0.75rem",
                                                                fontFamily:
                                                                    "monospace",
                                                            }}
                                                        >
                                                            {mentor.email}
                                                        </Typography>
                                                    </IconButton>
                                                )}
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        );
                    })}
                </Stack>
            </Box>

            {/* Snackbars */}
            <Snackbar
                open={submitApplicationToast}
                autoHideDuration={3000}
                onClose={() => setSubmitApplicationToast(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    onClose={() => setSubmitApplicationToast(false)}
                    severity="info"
                    sx={{ width: "100%" }}
                >
                    Applications open soon! Check the Timeline for dates.
                </Alert>
            </Snackbar>
            <Snackbar
                open={copyEmailToast}
                autoHideDuration={3000}
                onClose={() => setCopyEmailToast(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    onClose={() => setCopyEmailToast(false)}
                    severity="success"
                    sx={{ width: "100%" }}
                >
                    Email copied to clipboard!
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default ProjectsPage;
