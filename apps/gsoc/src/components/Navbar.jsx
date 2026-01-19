import { AutoAwesome, Close, Menu } from "@mui/icons-material";
import {
    AppBar,
    Avatar,
    Box,
    Button,
    Chip,
    Drawer,
    IconButton,
    List,
    ListItem,
    ListItemText,
    Toolbar,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
} from "@mui/material";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "../index.css";

const Navbar = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const location = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);

    const navItems = [
        { name: "Home", path: "/" },
        { name: "Projects", path: "/projects" },
        { name: "Mentors", path: "/mentors" },
        { name: "Timeline", path: "/timeline" },
        { name: "About", path: "/about" },
    ];

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    const isActivePath = (path) => location.pathname === path;

    const drawer = (
        <Box
            sx={{
                width: 250,
                height: "100%",
                background:
                    "linear-gradient(135deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.85) 100%)",
                backdropFilter: "blur(20px)",
                color: "#fff",
            }}
            role="presentation"
            onClick={handleDrawerToggle}
        >
            <Box sx={{ p: 2, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: 1,
                    }}
                >
                    <img
                        src="/gsoc_logo.webp"
                        alt="GSoC"
                        style={{ height: "20px" }}
                    />
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        GSoC
                    </Typography>
                    <Typography sx={{ color: "rgba(255,255,255,0.5)" }}>
                        ×
                    </Typography>
                    <img
                        src="/logo-text.svg"
                        alt="pollinations.ai"
                        style={{
                            height: "24px",
                            filter: "brightness(0) invert(1)",
                        }}
                    />
                </Box>
                <Chip
                    label="2026"
                    size="small"
                    sx={{
                        bgcolor: "rgba(122, 184, 255, 0.15)",
                        color: "#7AB8FF",
                        height: "20px",
                        fontSize: "15px",
                        fontFamily: "monospace",
                        fontWeight: 500,
                        border: "1px solid rgba(122, 184, 255, 0.3)",
                    }}
                />
            </Box>
            <List>
                {navItems.map((item) => (
                    <ListItem
                        key={item.name}
                        component={Link}
                        to={item.path}
                        sx={{
                            color: isActivePath(item.path)
                                ? "#fff"
                                : "rgba(255,255,255,0.7)",
                            backgroundColor: isActivePath(item.path)
                                ? "rgba(255,255,255,0.1)"
                                : "transparent",
                            "&:hover": {
                                backgroundColor: "rgba(255,255,255,0.05)",
                                color: "#fff",
                            },
                            transition: "all 0.3s ease",
                            borderRadius: "8px",
                            mx: 1,
                            mb: 0.5,
                        }}
                    >
                        <ListItemText
                            primary={item.name}
                            sx={{
                                "& .MuiTypography-root": {
                                    fontWeight: isActivePath(item.path)
                                        ? 600
                                        : 400,
                                },
                            }}
                        />
                    </ListItem>
                ))}

                {/* SocBot AI Assistant in Mobile Menu */}
                <ListItem
                    component={Link}
                    to="/bot"
                    sx={{
                        color: "rgba(96, 165, 250, 0.9)",
                        backgroundColor: "rgba(96, 165, 250, 0.1)",
                        border: "1px solid rgba(96, 165, 250, 0.2)",
                        "&:hover": {
                            backgroundColor: "rgba(96, 165, 250, 0.15)",
                            color: "#60a5fa",
                        },
                        transition: "all 0.3s ease",
                        borderRadius: "8px",
                        mx: 1,
                        mt: 2,
                    }}
                >
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1.5,
                            width: "100%",
                        }}
                    >
                        <Avatar
                            src="/polli_white.svg"
                            sx={{
                                width: 24,
                                height: 24,
                                bgcolor: "transparent",
                            }}
                        />
                        <ListItemText
                            primary="SocBot AI Assistant"
                            secondary="Ask me anything about GSOC!"
                            sx={{
                                "& .MuiTypography-root": {
                                    fontWeight: 600,
                                    color: "#60a5fa",
                                },
                                "& .MuiTypography-body2": {
                                    color: "rgba(96, 165, 250, 0.7)",
                                    fontSize: "0.75rem",
                                },
                            }}
                        />
                        <AutoAwesome
                            sx={{
                                fontSize: "16px",
                                color: "#60a5fa",
                                animation: "pulse 2s ease-in-out infinite",
                            }}
                        />
                    </Box>
                </ListItem>
            </List>
        </Box>
    );

    return (
        <>
            <AppBar
                position="sticky"
                elevation={0}
                sx={{
                    background:
                        "linear-gradient(135deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.6) 100%)",
                    backdropFilter: "blur(20px)",
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                    zIndex: theme.zIndex.drawer + 1,
                }}
            >
                <Toolbar sx={{ px: { xs: 2, md: 4 } }}>
                    {/* Logo and Version */}
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            flexGrow: 1,
                        }}
                    >
                        <Link
                            to="/"
                            style={{
                                textDecoration: "none",
                                color: "inherit",
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
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
                                        color: "rgba(255,255,255,0.5)",
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
                                    bgcolor: "rgba(122, 184, 255, 0.15)",
                                    color: "#7AB8FF",
                                    fontSize: "10px",
                                    height: "22px",
                                    fontFamily: "monospace",
                                    fontWeight: 500,
                                    border: "1px solid rgba(122, 184, 255, 0.3)",
                                    "&:hover": {
                                        bgcolor: "rgba(122, 184, 255, 0.25)",
                                    },
                                }}
                            />
                        </Link>
                    </Box>

                    {/* Desktop Navigation */}
                    {!isMobile && (
                        <Box
                            sx={{
                                display: "flex",
                                gap: 1,
                                alignItems: "center",
                            }}
                        >
                            {navItems.map((item) => (
                                <Button
                                    key={item.name}
                                    component={Link}
                                    to={item.path}
                                    sx={{
                                        color: isActivePath(item.path)
                                            ? "#fff"
                                            : "rgba(255,255,255,0.7)",
                                        fontWeight: isActivePath(item.path)
                                            ? 600
                                            : 400,
                                        position: "relative",
                                        px: 2,
                                        py: 1,
                                        borderRadius: "8px",
                                        transition: "all 0.3s ease",
                                        "&:hover": {
                                            color: "#fff",
                                            backgroundColor:
                                                "rgba(255,255,255,0.08)",
                                        },
                                        "&::after": isActivePath(item.path)
                                            ? {
                                                  content: '""',
                                                  position: "absolute",
                                                  bottom: 0,
                                                  left: "50%",
                                                  transform: "translateX(-50%)",
                                                  width: "4px",
                                                  height: "4px",
                                                  borderRadius: "50%",
                                                  backgroundColor: "#fff",
                                                  boxShadow:
                                                      "0 0 8px rgba(255,255,255,0.6)",
                                              }
                                            : {},
                                    }}
                                >
                                    {item.name}
                                </Button>
                            ))}

                            <Box sx={{ ml: 1, position: "relative" }}>
                                <Tooltip
                                    title="Ask Me Anything"
                                    placement="bottom"
                                >
                                    <IconButton
                                        component={Link}
                                        to="/bot"
                                        sx={{
                                            background: "transparent",
                                            width: 40,
                                            height: 40,
                                            transition: "all 0.3s ease",
                                            position: "relative",
                                            overflow: "hidden",
                                            "&:hover": {
                                                transform: "scale(1.1)",
                                                background:
                                                    "rgba(255,255,255,0.05)",
                                            },
                                        }}
                                    >
                                        <Box
                                            component="img"
                                            src="/polli_white.svg"
                                            alt="Bot"
                                            sx={{
                                                width: 22,
                                                height: 22,
                                                filter: "brightness(0) saturate(100%) invert(68%) sepia(52%) saturate(497%) hue-rotate(182deg) brightness(103%) contrast(101%)",
                                            }}
                                        />
                                        <AutoAwesome
                                            sx={{
                                                position: "absolute",
                                                top: 4,
                                                right: 4,
                                                fontSize: "12px",
                                                color: "#FBBC05",
                                                animation:
                                                    "pulse 2s ease-in-out infinite",
                                            }}
                                        />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        </Box>
                    )}

                    {/* Mobile Menu Button */}
                    {isMobile && (
                        <IconButton
                            color="inherit"
                            aria-label="open drawer"
                            edge="end"
                            onClick={handleDrawerToggle}
                            sx={{
                                color: "rgba(255,255,255,0.8)",
                                "&:hover": {
                                    backgroundColor: "rgba(255,255,255,0.1)",
                                },
                            }}
                        >
                            <Menu />
                        </IconButton>
                    )}
                </Toolbar>
            </AppBar>

            {/* Mobile Drawer */}
            <Drawer
                variant="temporary"
                anchor="right"
                open={mobileOpen}
                onClose={handleDrawerToggle}
                ModalProps={{
                    keepMounted: true, // Better open performance on mobile
                }}
                PaperProps={{
                    sx: {
                        background: "transparent",
                        boxShadow: "none",
                    },
                }}
            >
                <Box sx={{ position: "relative" }}>
                    <IconButton
                        onClick={handleDrawerToggle}
                        sx={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            color: "rgba(255,255,255,0.8)",
                            zIndex: 1,
                            "&:hover": {
                                backgroundColor: "rgba(255,255,255,0.1)",
                            },
                        }}
                    >
                        <Close />
                    </IconButton>
                    {drawer}
                </Box>
            </Drawer>
        </>
    );
};

export default Navbar;
