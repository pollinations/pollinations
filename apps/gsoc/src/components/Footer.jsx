import {
    Email,
    GitHub,
    Instagram,
    LinkedIn,
    Reddit,
    Twitter,
} from "@mui/icons-material";
import {
    Alert,
    Box,
    Chip,
    Divider,
    Grid,
    IconButton,
    Link,
    Snackbar,
    Tooltip,
    Typography,
} from "@mui/material";
import { useState } from "react";
import "../index.css";
import { Link as RouterLink } from "react-router-dom";
import { colors, gradients } from "../theme";

export default function Footer() {
    const currentYear = new Date().getFullYear();
    const [emailCopied, setEmailCopied] = useState(false);

    const handleCopyEmail = async () => {
        await navigator.clipboard.writeText("gsoc@pollinations.ai");
        setEmailCopied(true);
    };

    const resourceLinks = [
        { name: "Timeline", path: "/timeline" },
        { name: "Projects", path: "/projects" },
        { name: "Mentors", path: "/mentors" },
        { name: "About", path: "/about" },
    ];

    const communityLinks = [
        {
            name: "GitHub",
            icon: <GitHub />,
            url: "https://github.com/pollinations/pollinations",
        },
        {
            name: "Twitter",
            icon: <Twitter />,
            url: "https://twitter.com/pollinations_ai",
        },
        {
            name: "LinkedIn",
            icon: <LinkedIn />,
            url: "https://www.linkedin.com/company/pollinations-ai",
        },
        {
            name: "Reddit",
            icon: <Reddit />,
            url: "https://www.reddit.com/r/pollinations_ai",
        },

        {
            name: "Instagram",
            icon: <Instagram />,
            url: "https://www.instagram.com/pollinations_ai",
        },
    ];

    const legalLinks = [
        { name: "Privacy Policy", path: "/privacy" },
        {
            name: "Code of Conduct",
            url: "https://github.com/pollinations/pollinations/blob/main/CODE_OF_CONDUCT.md",
        },
        {
            name: "Contributing",
            url: "https://github.com/pollinations/pollinations/blob/main/CONTRIBUTING.md",
        },
    ];

    return (
        <Box
            component="footer"
            sx={{
                background: gradients.bgOverlay,
                backdropFilter: "blur(20px)",
                borderTop: `1px solid ${colors.border.light}`,
                color: colors.text.primary,
                mt: 8,
                position: "relative",
                overflow: "hidden",
                "&::before": {
                    content: '""',
                    position: "absolute",
                    top: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "600px",
                    height: "200px",
                    background:
                        "radial-gradient(circle, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0) 70%)",
                    pointerEvents: "none",
                },
            }}
        >
            <Box
                sx={{
                    maxWidth: "1200px",
                    mx: "auto",
                    px: { xs: 2, md: 4 },
                    py: { xs: 4, md: 6 },
                    position: "relative",
                    zIndex: 1,
                }}
            >
                <Grid container spacing={{ xs: 4, md: 6 }}>
                    {/* Brand Section */}
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Box sx={{ mb: 3 }}>
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
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                    }}
                                >
                                    <img
                                        src="/gsoc_logo.webp"
                                        alt="GSoC"
                                        style={{ height: "24px" }}
                                    />
                                    <Typography
                                        variant="h6"
                                        sx={{
                                            fontWeight: 700,
                                            background:
                                                "linear-gradient(135deg, #fff 0%, #a1a1aa 100%)",
                                            WebkitBackgroundClip: "text",
                                            WebkitTextFillColor: "transparent",
                                            letterSpacing: "-0.02em",
                                        }}
                                    >
                                        GSoC
                                    </Typography>
                                    <Typography
                                        sx={{
                                            color: colors.text.subtle,
                                            fontSize: "1.2rem",
                                        }}
                                    >
                                        ×
                                    </Typography>
                                    <img
                                        src="/logo-text.svg"
                                        alt="pollinations.ai"
                                        style={{
                                            height: "28px",
                                            filter: "brightness(0) invert(1)",
                                        }}
                                    />
                                </Box>
                                <Chip
                                    label="2026"
                                    size="small"
                                    sx={{
                                        bgcolor: colors.lime.dim,
                                        color: colors.lime.main,
                                        fontSize: "12px",
                                        height: "20px",
                                        fontFamily: "monospace",
                                        fontWeight: 500,
                                        border: `1px solid ${colors.lime.border}`,
                                    }}
                                />
                            </Box>
                            <Typography
                                variant="body2"
                                sx={{
                                    color: colors.text.muted,
                                    lineHeight: 1.6,
                                    mb: 2,
                                }}
                            >
                                Building the future of AI and open source
                                together through Google Summer of Code 2026.
                            </Typography>

                            {/* Social Icons + Email */}
                            <Box
                                sx={{
                                    display: "flex",
                                    gap: 1,
                                    flexWrap: "wrap",
                                }}
                            >
                                {/* Email Copy Button */}
                                <Tooltip title="Copy email" placement="top">
                                    <IconButton
                                        onClick={handleCopyEmail}
                                        sx={{
                                            color: colors.text.muted,
                                            border: `1px solid ${colors.border.light}`,
                                            borderRadius: "8px",
                                            px: 1.5,
                                            py: 1,
                                            gap: 1,
                                            transition: "all 0.3s ease",
                                            "&:hover": {
                                                color: colors.lime.main,
                                                borderColor: colors.lime.border,
                                                backgroundColor:
                                                    colors.lime.dim,
                                                transform: "translateY(-2px)",
                                            },
                                        }}
                                    >
                                        <Email sx={{ fontSize: "20px" }} />
                                        <Typography
                                            sx={{
                                                fontSize: "0.8rem",
                                                fontFamily: "monospace",
                                            }}
                                        >
                                            gsoc@pollinations.ai
                                        </Typography>
                                    </IconButton>
                                </Tooltip>
                                {communityLinks.map((social) => (
                                    <IconButton
                                        key={social.name}
                                        component="a"
                                        href={social.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        sx={{
                                            color: colors.text.muted,
                                            border: `1px solid ${colors.border.light}`,
                                            borderRadius: "8px",
                                            p: 1,
                                            transition: "all 0.3s ease",
                                            "&:hover": {
                                                color: colors.text.primary,
                                                borderColor:
                                                    colors.border.hover,
                                                backgroundColor:
                                                    colors.bg.cardGlass,
                                                transform: "translateY(-2px)",
                                            },
                                        }}
                                    >
                                        {social.icon}
                                    </IconButton>
                                ))}
                            </Box>
                        </Box>
                    </Grid>

                    {/* Resources Section */}
                    <Grid size={{ xs: 12, sm: 6, md: 2.5 }}>
                        <Typography
                            variant="subtitle2"
                            sx={{
                                fontWeight: 600,
                                mb: 2,
                                color: colors.text.primary,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                fontSize: "0.75rem",
                            }}
                        >
                            Resources
                        </Typography>
                        <Box
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 1.5,
                            }}
                        >
                            {resourceLinks.map((link) => (
                                <Link
                                    key={link.name}
                                    component={RouterLink}
                                    to={link.path}
                                    sx={{
                                        color: colors.text.muted,
                                        textDecoration: "none",
                                        fontSize: "0.875rem",
                                        transition: "all 0.3s ease",
                                        display: "inline-block",
                                        "&:hover": {
                                            color: colors.text.primary,
                                            transform: "translateX(4px)",
                                        },
                                    }}
                                >
                                    {link.name}
                                </Link>
                            ))}
                        </Box>
                    </Grid>

                    {/* Legal Section */}
                    <Grid size={{ xs: 12, sm: 12, md: 3 }}>
                        <Typography
                            variant="subtitle2"
                            sx={{
                                fontWeight: 600,
                                mb: 2,
                                color: colors.text.primary,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                fontSize: "0.75rem",
                            }}
                        >
                            Legal
                        </Typography>
                        <Box
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 1.5,
                            }}
                        >
                            {legalLinks.map((link) => (
                                <Link
                                    key={link.name}
                                    component={link.path ? RouterLink : "a"}
                                    to={link.path}
                                    href={link.url}
                                    target={link.url ? "_blank" : undefined}
                                    rel={
                                        link.url
                                            ? "noopener noreferrer"
                                            : undefined
                                    }
                                    sx={{
                                        color: colors.text.muted,
                                        textDecoration: "none",
                                        fontSize: "0.875rem",
                                        transition: "all 0.3s ease",
                                        display: "inline-block",
                                        "&:hover": {
                                            color: colors.text.primary,
                                            transform: "translateX(4px)",
                                        },
                                    }}
                                >
                                    {link.name}
                                </Link>
                            ))}
                        </Box>
                    </Grid>
                </Grid>

                {/* Divider */}
                <Divider
                    sx={{
                        my: 4,
                        borderColor: colors.border.light,
                        background:
                            "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
                    }}
                />

                {/* Copyright */}
                <Box
                    sx={{
                        display: "flex",
                        flexDirection: { xs: "column", sm: "row" },
                        justifyContent: "space-between",
                        alignItems: { xs: "flex-start", sm: "center" },
                        gap: 2,
                    }}
                >
                    <Typography
                        variant="body2"
                        sx={{
                            color: colors.text.subtle,
                            fontFamily: "monospace",
                            fontSize: "0.8rem",
                        }}
                    >
                        © {currentYear} pollinations.ai · MIT License
                    </Typography>
                </Box>
            </Box>

            {/* Email Copied Snackbar */}
            <Snackbar
                open={emailCopied}
                autoHideDuration={3000}
                onClose={() => setEmailCopied(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    onClose={() => setEmailCopied(false)}
                    severity="success"
                    sx={{ width: "100%" }}
                >
                    Email copied to clipboard!
                </Alert>
            </Snackbar>
        </Box>
    );
}
