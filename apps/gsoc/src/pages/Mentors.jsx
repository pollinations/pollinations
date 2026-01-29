import {
    Email,
    ExpandMore as ExpandMoreIcon,
    GitHub,
    LinkedIn,
    School,
    Work,
} from "@mui/icons-material";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Collapse,
    Divider,
    Grid,
    IconButton,
    Snackbar,
    Stack,
    Typography,
} from "@mui/material";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { parseMentors } from "../utils/parseMentors";
import { colors, gradients } from "../theme";

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

const MentorsPage = () => {
    const [mentors, setMentors] = useState([]);
    const [expanded, setExpanded] = useState(null);
    const [openToast, setOpenToast] = useState(false);

    useEffect(() => {
        document.title = "Mentors | GSoC × pollinations.ai";
        parseMentors().then(setMentors);
    }, []);

    const handleCloseToast = () => {
        setOpenToast(false);
    };

    const handleExpandClick = (index) => {
        setExpanded(expanded === index ? null : index);
    };

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

            <Box
                sx={{
                    maxWidth: "1200px",
                    margin: "0 auto",
                    position: "relative",
                    zIndex: 1,
                }}
            >
                {/* Header Section */}
                <Box sx={{ textAlign: "center", mb: 6 }}>
                    <Typography
                        variant="h2"
                        sx={{
                            marginBottom: "1rem",
                            fontWeight: 700,
                            letterSpacing: "-0.02em",
                            background: gradients.textHeading,
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                        }}
                    >
                        Mentors
                    </Typography>

                    <Typography
                        variant="h6"
                        sx={{
                            color: "rgba(255,255,255,0.7)",
                            fontWeight: 400,
                            maxWidth: "700px",
                            margin: "0 auto",
                            lineHeight: 1.6,
                        }}
                    >
                        Learn from the pollinations.ai team. Build in the open.
                    </Typography>

                    {/* Stats Section */}
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
                                {mentors.length}
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{
                                    color: "rgba(255,255,255,0.6)",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                }}
                            >
                                Expert Mentors
                            </Typography>
                        </Box>
                        <Box sx={{ textAlign: "center" }}>
                            <Typography
                                variant="h4"
                                sx={{ color: "#fff", fontWeight: 700 }}
                            >
                                16
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{
                                    color: "rgba(255,255,255,0.6)",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                }}
                            >
                                Years Combined
                            </Typography>
                        </Box>
                    </Stack>
                </Box>

                <Grid container spacing={4}>
                    {mentors.map((mentor, index) => (
                        <Grid size={{ xs: 12, md: 6 }} key={mentor.id}>
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
                                        borderRadius: "20px",
                                        color: "#fff",
                                        transition: "all 0.4s ease",
                                        position: "relative",
                                        overflow: "hidden",
                                        "&:hover": {
                                            transform: "translateY(-8px)",
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
                                            background: gradients.cardAccent,
                                            borderRadius: "20px 20px 0 0",
                                        },
                                    }}
                                >
                                    <CardContent
                                        sx={{
                                            padding: {
                                                xs: "1.5rem",
                                                sm: "2rem",
                                                md: "2.5rem",
                                            },
                                            height: "100%",
                                            display: "flex",
                                            flexDirection: "column",
                                            overflow: "hidden",
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                display: "flex",
                                                flexDirection: {
                                                    xs: "column",
                                                    sm: "row",
                                                },
                                                alignItems: {
                                                    xs: "center",
                                                    sm: "flex-start",
                                                },
                                                gap: { xs: 2, sm: 3 },
                                                mb: 3,
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    width: 80,
                                                    height: 80,
                                                    minWidth: 80,
                                                    minHeight: 80,
                                                    flexShrink: 0,
                                                    border: "3px solid rgba(255,255,255,0.2)",
                                                    boxShadow:
                                                        "0 8px 32px rgba(0,0,0,0.3)",
                                                    backgroundImage: `url(${mentor.imageUrl})`,
                                                    backgroundSize: "cover",
                                                    borderRadius: "50%",
                                                    backgroundPosition:
                                                        "center",
                                                }}
                                            />

                                            <Box
                                                sx={{
                                                    flexGrow: 1,
                                                    width: "100%",
                                                    minWidth: 0,
                                                }}
                                            >
                                                <Typography
                                                    variant="h5"
                                                    sx={{
                                                        fontWeight: 700,
                                                        mb: 0.5,
                                                        color: "#fff",
                                                        display: "flex",
                                                        flexDirection: {
                                                            xs: "column",
                                                            sm: "row",
                                                        },
                                                        justifyContent: {
                                                            xs: "center",
                                                            sm: "space-between",
                                                        },
                                                        alignItems: {
                                                            xs: "center",
                                                            sm: "center",
                                                        },
                                                        textAlign: {
                                                            xs: "center",
                                                            sm: "left",
                                                        },
                                                        gap: 1,
                                                        fontSize: {
                                                            xs: "1.25rem",
                                                            sm: "1.5rem",
                                                        },
                                                    }}
                                                >
                                                    {mentor.name}
                                                    <Box
                                                        sx={{
                                                            textAlign: "center",
                                                            display:
                                                                "inline-flex",
                                                            ml: {
                                                                xs: 0,
                                                                sm: 2,
                                                            },
                                                            borderRadius:
                                                                "12px",
                                                            px: 1,
                                                            height: "20px",
                                                            bgcolor:
                                                                "rgba(255, 215, 0, 0.1)",
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        <Typography
                                                            variant="p"
                                                            sx={{
                                                                color: "#888",
                                                                fontWeight: 700,
                                                                fontSize:
                                                                    "12px",
                                                                display: "flex",
                                                                alignItems:
                                                                    "center",
                                                                gap: 0.5,
                                                            }}
                                                        >
                                                            {
                                                                mentor.yearsExperience
                                                            }{" "}
                                                            yrs exp.
                                                        </Typography>
                                                    </Box>
                                                </Typography>

                                                <Typography
                                                    variant="subtitle1"
                                                    sx={{
                                                        color: colors.lime.main,
                                                        fontWeight: 600,
                                                        mb: 1,
                                                        textAlign: {
                                                            xs: "center",
                                                            sm: "left",
                                                        },
                                                    }}
                                                >
                                                    {mentor.title}
                                                </Typography>

                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: "rgba(255,255,255,0.8)",
                                                        lineHeight: 1.6,
                                                    }}
                                                >
                                                    {mentor.bio}
                                                </Typography>
                                            </Box>
                                        </Box>

                                        {/* Core Expertise */}
                                        <Box sx={{ mb: 3 }}>
                                            <Typography
                                                variant="subtitle2"
                                                sx={{
                                                    color: "rgba(255,255,255,0.7)",
                                                    mb: 2,
                                                    fontWeight: 600,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 1,
                                                }}
                                            >
                                                <School
                                                    sx={{ fontSize: "18px" }}
                                                />
                                                Technical Skills
                                            </Typography>
                                            <Stack
                                                direction="row"
                                                flexWrap="wrap"
                                                gap={1}
                                            >
                                                {mentor.skills.map((skill) => (
                                                    <Chip
                                                        key={skill}
                                                        label={skill}
                                                        size="small"
                                                        sx={{
                                                            fontSize: "0.75rem",
                                                            height: "24px",
                                                            bgcolor:
                                                                "rgba(255,255,255,0.08)",
                                                            color: "rgba(255,255,255,0.9)",
                                                            border: "1px solid rgba(255,255,255,0.15)",
                                                            "&:hover": {
                                                                bgcolor:
                                                                    "rgba(255,255,255,0.15)",
                                                                transform:
                                                                    "translateY(-1px)",
                                                            },
                                                        }}
                                                    />
                                                ))}
                                            </Stack>
                                        </Box>

                                        {/* Action Buttons */}
                                        <Box
                                            sx={{
                                                display: "flex",
                                                flexDirection: {
                                                    xs: "column",
                                                    sm: "row",
                                                },
                                                justifyContent: {
                                                    xs: "center",
                                                    sm: "space-between",
                                                },
                                                alignItems: {
                                                    xs: "stretch",
                                                    sm: "center",
                                                },
                                                gap: { xs: 2, sm: 0 },
                                                mt: "auto",
                                            }}
                                        >
                                            {/* Social Links */}
                                            <Stack
                                                direction="row"
                                                spacing={1}
                                                justifyContent={{
                                                    xs: "center",
                                                    sm: "flex-start",
                                                }}
                                                flexWrap="wrap"
                                            >
                                                <IconButton
                                                    component="a"
                                                    href={mentor.linkedin}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    size="small"
                                                    sx={{
                                                        color: "rgba(255,255,255,0.7)",
                                                        border: "1px solid rgba(255,255,255,0.15)",
                                                        borderRadius: "8px",
                                                        "&:hover": {
                                                            color: "#0077b5",
                                                            borderColor:
                                                                "#0077b5",
                                                            backgroundColor:
                                                                "rgba(0, 119, 181, 0.1)",
                                                        },
                                                    }}
                                                >
                                                    <LinkedIn fontSize="small" />
                                                </IconButton>
                                                <IconButton
                                                    component="a"
                                                    href={mentor.github}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    size="small"
                                                    sx={{
                                                        color: "rgba(255,255,255,0.7)",
                                                        border: "1px solid rgba(255,255,255,0.15)",
                                                        borderRadius: "8px",
                                                        "&:hover": {
                                                            color: "#fff",
                                                            borderColor: "#fff",
                                                            backgroundColor:
                                                                "rgba(255,255,255,0.1)",
                                                        },
                                                    }}
                                                >
                                                    <GitHub fontSize="small" />
                                                </IconButton>
                                                <IconButton
                                                    component="p"
                                                    onClick={async () => {
                                                        await navigator.clipboard.writeText(
                                                            mentor.email,
                                                        );
                                                        setOpenToast(true);
                                                    }}
                                                    size="small"
                                                    sx={{
                                                        color: "rgba(255,255,255,0.7)",
                                                        display: "flex",
                                                        flexDirection: "row",
                                                        alignItems: "center",
                                                        gap: 0.5,
                                                        fontSize: "0.875rem",
                                                        px: "15px",
                                                        justifyContent:
                                                            "center",
                                                        border: "1px solid rgba(255,255,255,0.15)",
                                                        borderRadius: "25px",
                                                        "&:hover": {
                                                            color: "#e9d5ff",
                                                            backgroundColor:
                                                                "rgba(168, 85, 247, 0.15)",
                                                        },
                                                    }}
                                                >
                                                    <Email
                                                        sx={{
                                                            fontSize: "19px",
                                                        }}
                                                    />{" "}
                                                    {mentor?.email}
                                                </IconButton>
                                            </Stack>

                                            {/* Expand Button */}
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                onClick={() =>
                                                    handleExpandClick(index)
                                                }
                                                endIcon={
                                                    <ExpandMoreIcon
                                                        sx={{
                                                            transform:
                                                                expanded ===
                                                                index
                                                                    ? "rotate(180deg)"
                                                                    : "rotate(0deg)",
                                                            transition:
                                                                "transform 0.3s ease",
                                                        }}
                                                    />
                                                }
                                                sx={{
                                                    borderColor:
                                                        colors.lime.border,
                                                    color: colors.lime.main,
                                                    textTransform: "none",
                                                    fontSize: "0.875rem",
                                                    borderRadius: "8px",
                                                    px: 2,
                                                    "&:hover": {
                                                        borderColor:
                                                            colors.lime.main,
                                                        color: "#fff",
                                                        backgroundColor:
                                                            colors.lime.dim,
                                                    },
                                                }}
                                            >
                                                {expanded === index
                                                    ? "Show Less"
                                                    : "Learn More"}
                                            </Button>
                                        </Box>

                                        {/* Expandable Content */}
                                        <Collapse
                                            in={expanded === index}
                                            timeout={600}
                                            sx={{
                                                "& .MuiCollapse-wrapper": {
                                                    transition:
                                                        "all 0.6s cubic-bezier(0.4, 0, 0.2, 1) !important",
                                                },
                                            }}
                                        >
                                            <motion.div
                                                initial={{ opacity: 0, y: -20 }}
                                                animate={{
                                                    opacity:
                                                        expanded === index
                                                            ? 1
                                                            : 0,
                                                    y:
                                                        expanded === index
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
                                                        my: 3,
                                                        borderColor:
                                                            "rgba(255,255,255,0.1)",
                                                    }}
                                                />

                                                {/* Detailed Bio */}
                                                <Typography
                                                    variant="h6"
                                                    sx={{
                                                        color: "#fff",
                                                        fontWeight: 600,
                                                        mb: 2,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 1,
                                                    }}
                                                >
                                                    <Work
                                                        sx={{
                                                            fontSize: "20px",
                                                        }}
                                                    />
                                                    Professional Background
                                                </Typography>

                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: "rgba(255,255,255,0.9)",
                                                        lineHeight: 1.7,
                                                        mb: 3,
                                                    }}
                                                >
                                                    {mentor.longDescription}
                                                </Typography>
                                            </motion.div>
                                        </Collapse>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        </Grid>
                    ))}
                </Grid>
            </Box>
            <Snackbar
                open={openToast}
                autoHideDuration={3000}
                onClose={handleCloseToast}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    onClose={handleCloseToast}
                    severity="success"
                    sx={{ width: "100%" }}
                >
                    Email copied to clipboard!
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default MentorsPage;
