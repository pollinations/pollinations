import {
    ArrowForward,
    Code,
    GitHub,
    Groups,
    Language,
    OpenInNew,
    Psychology,
    RocketLaunch,
    School,
    MenuBook,
} from "@mui/icons-material";
import {
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Grid,
    Stack,
    Typography
} from "@mui/material";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import mentorsData from "../info/mentors.json";
import { colors, gradients } from "../theme";

// Animation variants
const cardVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: (i) => ({
        opacity: 1,
        y: 0,
        transition: {
            delay: i * 0.15,
            duration: 0.6,
            ease: "easeOut",
        },
    }),
};

const AboutPage = () => {
    useEffect(() => {
        document.title = "About | GSoC × pollinations.ai";
    }, []);

    const features = [
        {
            icon: <Psychology />,
            title: "Open-source by default",
            description:
                "All development happens in public. Issues, pull requests, design trade-offs, and roadmap discussions are open for anyone to see — and join.",
        },
        {
            icon: <Code />,
            title: "Production-grade code",
            description:
                "We focus on composable systems, clean APIs, and automation. Contributors work on code that is deployed and used, not throwaway demos.",
        },
        {
            icon: <Groups />,
            title: "Real mentorship",
            description:
                "Mentors are active maintainers of the pollinations.ai codebase. You'll get feedback on real PRs, architectural decisions, and long-term maintainability.",
        },
        {
            icon: <School />,
            title: "Skills that compound",
            description:
                "Build experience in distributed systems, AI model orchestration, APIs, and open-source collaboration — skills that carry well beyond GSoC.",
        },
    ];

    const whatYouDo = [
        "Work directly in the pollinations.ai open-source repositories",
        "Design and ship features used by real users",
        "Collaborate with mentors and the community in public",
        "Deliver measurable outcomes, not just reports",
    ];

    const visionPoints = [
        {
            title: "Open & Accessible",
            description:
                "AI tools available to everyone — earn daily Pollen by contributing, no credit card required.",
        },
        {
            title: "Transparent & Ethical",
            description:
                "Open code enables scrutiny, learning, and accountability.",
        },
        {
            title: "Community-Driven",
            description:
                "Built by developers, creators, and researchers working together.",
        },
        {
            title: "Composable by Design",
            description:
                "Services that interoperate instead of locking users in.",
        },
        {
            title: "Continuously Evolving",
            description: "We move fast while staying committed to openness.",
        },
    ];

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
                {/* Hero Section */}
                <Box sx={{ textAlign: "center", mb: 8 }}>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <Box
                            component="img"
                            src="/logo-text.svg"
                            alt="pollinations.ai"
                            sx={{
                                height: 48,
                                mb: 3,
                                filter: "brightness(0) invert(1)",
                            }}
                        />

                        <Typography
                            variant="h3"
                            sx={{
                                marginBottom: "1rem",
                                fontWeight: 700,
                                letterSpacing: "-0.02em",
                                background: gradients.textHeading,
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                            }}
                        >
                            Open-source AI, built in public
                        </Typography>

                        <Typography
                            variant="h6"
                            sx={{
                                color: "rgba(255,255,255,0.7)",
                                fontWeight: 400,
                                maxWidth: "700px",
                                margin: "0 auto",
                                lineHeight: 1.7,
                                mb: 4,
                            }}
                        >
                            A community-driven open-source AI project powering{" "}
                            <strong style={{ color: colors.lime.main }}>
                                500+ real projects
                            </strong>{" "}
                            across text, image, audio, and creative tooling.
                            We're a <strong>GSoC 2026</strong> mentoring
                            organization and an active open-source community
                            year-round.
                        </Typography>

                        <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={2}
                            justifyContent="center"
                            alignItems="center"
                        >
                            <Button
                                component={Link}
                                to="/projects"
                                variant="contained"
                                size="large"
                                endIcon={<ArrowForward />}
                                sx={{
                                    bgcolor: colors.lime.main,
                                    color: colors.bg.deep,
                                    textTransform: "none",
                                    fontSize: "1.1rem",
                                    fontWeight: 600,
                                    py: 1.5,
                                    px: 4,
                                    "&:hover": {
                                        bgcolor: colors.lime.light,
                                        transform: "translateY(-2px)",
                                        boxShadow: `0 8px 25px ${colors.lime.glow}`,
                                    },
                                }}
                            >
                                View Project Ideas
                            </Button>
                            <Button
                                href="https://summerofcode.withgoogle.com/how-it-works/"
                                target="_blank"
                                variant="outlined"
                                size="large"
                                sx={{
                                    borderColor: colors.border.light,
                                    color: "#fff",
                                    textTransform: "none",
                                    fontSize: "1.1rem",
                                    py: 1.5,
                                    px: 4,
                                    "&:hover": {
                                        borderColor: colors.lime.border,
                                        backgroundColor: colors.lime.dim,
                                    },
                                }}
                                endIcon={
                                        <OpenInNew sx={{ fontSize: 14 }} />
                                    }
                            >
                                How GSoC Works
                            </Button>
                        </Stack>
                    </motion.div>
                </Box>

                {/* What Makes Us Different */}
                <Box sx={{ mb: 8 }}>
                    <Typography
                        variant="h3"
                        sx={{
                            textAlign: "center",
                            marginBottom: "3rem",
                            fontWeight: 700,
                            color: "#fff",
                        }}
                    >
                        What Makes Us Different
                    </Typography>

                    <Grid container spacing={4} justifyContent="center">
                        {features.map((feature, index) => (
                            <Grid size={{ xs: 12, md: 6 }} key={feature.title}>
                                <motion.div
                                    custom={index}
                                    variants={cardVariants}
                                    initial="hidden"
                                    whileInView="visible"
                                    viewport={{ once: true }}
                                >
                                    <Card
                                        elevation={0}
                                        sx={{
                                            height: "100%",
                                            background:
                                                "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
                                            backdropFilter: "blur(20px)",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            borderRadius: "16px",
                                            color: "#fff",
                                            transition: "all 0.3s ease",
                                            "&:hover": {
                                                transform: "translateY(-4px)",
                                                borderColor:
                                                    "rgba(255,255,255,0.3)",
                                                boxShadow:
                                                    "0 20px 40px -10px rgba(0,0,0,0.4)",
                                            },
                                        }}
                                    >
                                        <CardContent
                                            sx={{
                                                p: 3,
                                                height: "100%",
                                                display: "flex",
                                                flexDirection: "column",
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 2,
                                                    mb: 2,
                                                }}
                                            >
                                                <Box
                                                    sx={{
                                                        p: 1.5,
                                                        borderRadius: "12px",
                                                        bgcolor:
                                                            colors.lime.dim,
                                                        border: `1px solid ${colors.lime.border}`,
                                                        color: colors.lime.main,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent:
                                                            "center",
                                                    }}
                                                >
                                                    {feature.icon}
                                                </Box>
                                                <Typography
                                                    variant="h6"
                                                    sx={{
                                                        fontWeight: 600,
                                                        color: "#fff",
                                                    }}
                                                >
                                                    {feature.title}
                                                </Typography>
                                            </Box>
                                            <Typography
                                                variant="body1"
                                                sx={{
                                                    color: "rgba(255,255,255,0.8)",
                                                    lineHeight: 1.6,
                                                    flexGrow: 1,
                                                }}
                                            >
                                                {feature.description}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            </Grid>
                        ))}
                    </Grid>
                </Box>

                {/* What You'll Actually Do */}
                <Box sx={{ mb: 8 }}>
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                    >
                        <Card
                            elevation={0}
                            sx={{
                                background: `linear-gradient(135deg, ${colors.lime.dim} 0%, rgba(163, 230, 53, 0.05) 100%)`,
                                border: `1px solid ${colors.lime.border}`,
                                borderRadius: "20px",
                                p: 4,
                            }}
                        >
                            <Typography
                                variant="h4"
                                sx={{ fontWeight: 700, color: "#fff", mb: 3 }}
                            >
                                What GSoC contributors actually do
                            </Typography>
                            <Grid container spacing={2}>
                                {whatYouDo.map((item) => (
                                    <Grid size={{ xs: 12, md: 6 }} key={item}>
                                        <Box
                                            sx={{
                                                display: "flex",
                                                alignItems: "flex-start",
                                                gap: 2,
                                            }}
                                        >
                                            <RocketLaunch
                                                sx={{
                                                    color: colors.lime.main,
                                                    mt: 0.5,
                                                }}
                                            />
                                            <Typography
                                                variant="body1"
                                                sx={{
                                                    color: "rgba(255,255,255,0.9)",
                                                    lineHeight: 1.6,
                                                }}
                                            >
                                                {item}
                                            </Typography>
                                        </Box>
                                    </Grid>
                                ))}
                            </Grid>
                            <Typography
                                variant="body2"
                                sx={{
                                    color: "rgba(255,255,255,0.6)",
                                    mt: 3,
                                    fontStyle: "italic",
                                }}
                            >
                                All work remains open source. Contributions may
                                also be used commercially under the project's
                                license.
                            </Typography>
                            <Box sx={{ mt: 4 }}>
                                <Button
                                    component={Link}
                                    to="/coc"
                                    variant="contained"
                                    endIcon={<ArrowForward />}
                                    sx={{
                                        bgcolor: colors.lime.main,
                                        color: colors.bg.deep,
                                        textTransform: "none",
                                        fontWeight: 600,
                                        "&:hover": {
                                            bgcolor: colors.lime.light,
                                        },
                                    }}
                                >
                                    Code of Conduct
                                </Button>
                            </Box>
                        </Card>
                    </motion.div>
                </Box>

                {/* Our Vision */}
                <Box sx={{ mb: 8 }}>
                    <Typography
                        variant="h4"
                        sx={{
                            fontWeight: 700,
                            color: "#fff",
                            mb: 4,
                            textAlign: "center",
                        }}
                    >
                        Our Vision
                    </Typography>
                    <Box
                        sx={{
                            display: "flex",
                            flexWrap: "wrap",
                            justifyContent: "center",
                            gap: 3,
                        }}
                    >
                        {visionPoints.map((point) => (
                            <Box
                                key={point.title}
                                sx={{
                                    textAlign: "center",
                                    p: 2,
                                    width: { xs: "100%", sm: "45%", md: "18%" },
                                    minWidth: "200px",
                                }}
                            >
                                <Typography
                                    variant="h6"
                                    sx={{
                                        color: colors.lime.main,
                                        fontWeight: 600,
                                        mb: 1,
                                    }}
                                >
                                    {point.title}
                                </Typography>
                                <Typography
                                    variant="body2"
                                    sx={{
                                        color: "rgba(255,255,255,0.7)",
                                        lineHeight: 1.6,
                                    }}
                                >
                                    {point.description}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                </Box>

                {/* Meet the Mentors */}
                <Box sx={{ mb: 8 }}>
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                    >
                        <Card
                            elevation={0}
                            sx={{
                                background:
                                    "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
                                border: `1px solid ${colors.border.light}`,
                                borderRadius: "20px",
                                p: 4,
                                textAlign: "center",
                            }}
                        >
                            <Typography
                                variant="h5"
                                sx={{ fontWeight: 700, color: "#fff", mb: 3 }}
                            >
                                Meet the Mentors
                            </Typography>
                            <Stack
                                direction="row"
                                spacing={-1}
                                justifyContent="center"
                                sx={{ mb: 3 }}
                            >
                                {mentorsData
                                    .slice(0, 4)
                                    .map((mentor, index) => (
                                        <Avatar
                                            key={mentor.id}
                                            src={mentor.imageUrl}
                                            alt={mentor.name}
                                            sx={{
                                                width: 56,
                                                height: 56,
                                                border: `3px solid ${colors.bg.deep}`,
                                                zIndex:
                                                    mentorsData.length - index,
                                            }}
                                        />
                                    ))}
                            </Stack>
                            <Typography
                                variant="body2"
                                sx={{ color: "rgba(255,255,255,0.7)", mb: 3 }}
                            >
                                Active maintainers ready to guide your
                                contributions
                            </Typography>
                            <Button
                                component={Link}
                                to="/mentors"
                                variant="outlined"
                                endIcon={<ArrowForward />}
                                sx={{
                                    borderColor: colors.border.light,
                                    color: "#fff",
                                    textTransform: "none",
                                    "&:hover": {
                                        borderColor: colors.lime.border,
                                        backgroundColor: colors.lime.dim,
                                    },
                                }}
                            >
                                View All Mentors
                            </Button>
                        </Card>
                    </motion.div>
                </Box>

                <Box sx={{ mb: 8 }}>
                    <Typography
                        variant="h5"
                        sx={{
                            fontWeight: 700,
                            color: "#fff",
                            mb: 3,
                            textAlign: "center",
                        }}
                    >
                        Quick Links
                    </Typography>
                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={2}
                        justifyContent="center"
                        alignItems="center"
                        flexWrap="wrap"
                    >
                        <Button
                            href="https://summerofcode.withgoogle.com/"
                            target="_blank"
                            startIcon={<School />}
                            sx={{
                                py: 1.5,
                                px: 3,
                                color: "#fff",
                                border: `1px solid ${colors.border.light}`,
                                borderRadius: "12px",
                                textTransform: "none",
                                fontSize: "1rem",
                                "&:hover": {
                                    borderColor: colors.lime.border,
                                    backgroundColor: colors.lime.dim,
                                },
                            }}
                        >
                            GSoC 2026
                        </Button>
                        <Button
                            href="https://discord.gg/pollinations-ai-885844321461485618"
                            target="_blank"
                            startIcon={
                                <Box
                                    component="img"
                                    src="https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png"
                                    alt="Discord"
                                    sx={{
                                        width: 20,
                                        height: 20,
                                        filter: "brightness(0) invert(1)",
                                    }}
                                />
                            }
                            sx={{
                                py: 1.5,
                                px: 3,
                                color: "#fff",
                                border: `1px solid ${colors.border.light}`,
                                borderRadius: "12px",
                                textTransform: "none",
                                fontSize: "1rem",
                                "&:hover": {
                                    borderColor: colors.lime.border,
                                    backgroundColor: colors.lime.dim,
                                },
                            }}
                        >
                            Discord
                        </Button>
                        <Button
                            href="https://github.com/pollinations/pollinations"
                            target="_blank"
                            startIcon={<GitHub />}
                            sx={{
                                py: 1.5,
                                px: 3,
                                color: "#fff",
                                border: `1px solid ${colors.border.light}`,
                                borderRadius: "12px",
                                textTransform: "none",
                                fontSize: "1rem",
                                "&:hover": {
                                    borderColor: colors.lime.border,
                                    backgroundColor: colors.lime.dim,
                                },
                            }}
                        >
                            GitHub
                        </Button>
                        <Button
                            href="https://pollinations.ai"
                            target="_blank"
                            startIcon={<Language />}
                            sx={{
                                py: 1.5,
                                px: 3,
                                color: "#fff",
                                border: `1px solid ${colors.border.light}`,
                                borderRadius: "12px",
                                textTransform: "none",
                                fontSize: "1rem",
                                "&:hover": {
                                    borderColor: colors.lime.border,
                                    backgroundColor: colors.lime.dim,
                                },
                            }}
                        >
                            pollinations.ai
                        </Button>
                        <Button
                            href="/coc"
                            target="_blank"
                            startIcon={<MenuBook />}
                            sx={{
                                py: 1.5,
                                px: 3,
                                color: "#fff",
                                border: `1px solid ${colors.border.light}`,
                                borderRadius: "12px",
                                textTransform: "none",
                                fontSize: "1rem",
                                "&:hover": {
                                    borderColor: colors.lime.border,
                                    backgroundColor: colors.lime.dim,
                                },
                            }}
                        >
                            Contributing
                        </Button>
                    </Stack>
                </Box>

                {/* Contact */}
                <Box sx={{ mb: 8, display: "flex", justifyContent: "center" }}>
                    <Card
                        elevation={0}
                        sx={{
                            background:
                                "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
                            border: `1px solid ${colors.border.light}`,
                            borderRadius: "16px",
                            p: 4,
                            textAlign: "center",
                            width: "fit-content",
                        }}
                    >
                        <Typography
                            variant="h6"
                            sx={{ fontWeight: 600, color: "#fff", mb: 2 }}
                        >
                            Get in Touch
                        </Typography>
                        <Typography
                            variant="body1"
                            sx={{ color: "rgba(255,255,255,0.8)", mb: 1 }}
                        >
                            <strong>Elliot</strong> — Organization Admin
                        </Typography>
                        <Typography
                            component="a"
                            href="mailto:elliot@pollinations.ai"
                            sx={{
                                color: colors.lime.main,
                                fontFamily: "monospace",
                                fontSize: "1.1rem",
                                textDecoration: "none",
                                "&:hover": { color: colors.lime.light },
                            }}
                        >
                            elliot@pollinations.ai
                        </Typography>
                    </Card>
                </Box>

                {/* Final CTA */}
                <Box sx={{ textAlign: "center" }}>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                    >
                        <Typography
                            variant="h4"
                            sx={{ color: "#fff", fontWeight: 700, mb: 2 }}
                        >
                            Ready to make an impact?
                        </Typography>
                        <Typography
                            variant="body1"
                            sx={{
                                color: "rgba(255,255,255,0.8)",
                                mb: 4,
                                maxWidth: "600px",
                                mx: "auto",
                            }}
                        >
                            Join a global open-source community and help shape
                            the future of AI through real, production-grade
                            contributions.
                        </Typography>
                        <Stack spacing={2} alignItems="center">
                            <Button
                                component={Link}
                                to="/projects"
                                variant="contained"
                                size="large"
                                endIcon={<ArrowForward />}
                                sx={{
                                    bgcolor: colors.lime.main,
                                    color: colors.bg.deep,
                                    textTransform: "none",
                                    fontSize: "1.1rem",
                                    fontWeight: 600,
                                    py: 1.5,
                                    px: 5,
                                    "&:hover": {
                                        bgcolor: colors.lime.light,
                                        transform: "translateY(-2px)",
                                        boxShadow: `0 8px 25px ${colors.lime.glow}`,
                                    },
                                }}
                            >
                                View Project Ideas
                            </Button>
                        </Stack>
                    </motion.div>
                </Box>
            </Box>
        </Box>
    );
};

export default AboutPage;
