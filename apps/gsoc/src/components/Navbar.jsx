import { AutoAwesome, Close, Menu } from "@mui/icons-material";
import {
    AppBar,
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
import { colors, gradients } from "../theme";

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
                background: gradients.bgOverlay,
                backdropFilter: "blur(20px)",
                color: colors.text.primary,
            }}
            role="presentation"
            onClick={handleDrawerToggle}
        >
            <Box
                sx={{ p: 2, borderBottom: `1px solid ${colors.border.light}` }}
            >
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
                        bgcolor: colors.lime.dim,
                        color: colors.lime.main,
                        height: "20px",
                        fontSize: "15px",
                        fontFamily: "monospace",
                        fontWeight: 500,
                        border: `1px solid ${colors.lime.border}`,
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
                                ? colors.lime.main
                                : colors.text.muted,
                            backgroundColor: isActivePath(item.path)
                                ? colors.lime.dim
                                : "transparent",
                            "&:hover": {
                                backgroundColor: colors.bg.cardGlass,
                                color: colors.lime.main,
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

                {/* Polly AI Assistant in Mobile Menu */}
                <ListItem
                    component={Link}
                    to="/bot"
                    sx={{
                        color: isActivePath("/bot")
                            ? colors.lime.main
                            : colors.text.muted,
                        backgroundColor: isActivePath("/bot")
                            ? colors.lime.dim
                            : "transparent",
                        "&:hover": {
                            backgroundColor: colors.bg.cardGlass,
                            color: colors.lime.main,
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
                        <Box
                            component="img"
                            src="/polli_white.svg"
                            alt="Polly"
                            sx={{
                                width: 24,
                                height: 24,
                                filter: isActivePath("/bot")
                                    ? "brightness(0) saturate(100%) invert(79%) sepia(55%) saturate(497%) hue-rotate(44deg) brightness(103%) contrast(101%)"
                                    : "brightness(0) invert(0.7)",
                            }}
                        />
                        <ListItemText
                            primary="Polly"
                            sx={{
                                "& .MuiTypography-root": {
                                    fontWeight: isActivePath("/bot")
                                        ? 600
                                        : 400,
                                },
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
                    background: gradients.bgOverlay,
                    backdropFilter: "blur(20px)",
                    borderBottom: `1px solid ${colors.border.light}`,
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
                                    fontSize: "10px",
                                    height: "22px",
                                    fontFamily: "monospace",
                                    fontWeight: 500,
                                    border: `1px solid ${colors.lime.border}`,
                                    "&:hover": {
                                        bgcolor: colors.lime.border,
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
                                            ? colors.lime.main
                                            : colors.text.muted,
                                        fontWeight: isActivePath(item.path)
                                            ? 600
                                            : 400,
                                        position: "relative",
                                        px: 2,
                                        py: 1,
                                        borderRadius: "8px",
                                        transition: "all 0.3s ease",
                                        "&:hover": {
                                            color: colors.text.primary,
                                            backgroundColor:
                                                colors.bg.cardGlassHover,
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
                                                  backgroundColor:
                                                      colors.lime.main,
                                                  boxShadow: `0 0 8px ${colors.lime.glow}`,
                                              }
                                            : {},
                                    }}
                                >
                                    {item.name}
                                </Button>
                            ))}

                            <Tooltip title="Polly" placement="bottom">
                                <IconButton
                                    component={Link}
                                    to="/bot"
                                    sx={{
                                        background: "transparent",
                                        width: 40,
                                        height: 40,
                                        ml: 1,
                                        position: "relative",
                                        transition: "all 0.3s ease",
                                        "&:hover": {
                                            background:
                                                colors.bg.cardGlassHover,
                                        },
                                    }}
                                >
                                    <Box
                                        component="img"
                                        src="/polli_white.svg"
                                        alt="Polly"
                                        sx={{
                                            width: 22,
                                            height: 22,
                                            filter: isActivePath("/bot")
                                                ? "brightness(0) saturate(100%) invert(79%) sepia(55%) saturate(497%) hue-rotate(44deg) brightness(103%) contrast(101%)"
                                                : "brightness(0) invert(0.7)",
                                            transition: "filter 0.3s ease",
                                        }}
                                    />
                                    <AutoAwesome
                                        sx={{
                                            position: "absolute",
                                            top: 4,
                                            right: 4,
                                            fontSize: "12px",
                                            color: colors.lime.main,
                                            animation:
                                                "pulse 2s ease-in-out infinite",
                                        }}
                                    />
                                </IconButton>
                            </Tooltip>
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
                                color: colors.text.secondary,
                                "&:hover": {
                                    backgroundColor: colors.border.light,
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
                            color: colors.text.secondary,
                            zIndex: 1,
                            "&:hover": {
                                backgroundColor: colors.border.light,
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
