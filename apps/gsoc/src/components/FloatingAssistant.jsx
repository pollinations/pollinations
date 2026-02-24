import { AutoAwesome } from "@mui/icons-material";
import { Box, Fab, Tooltip } from "@mui/material";
import { Link, useLocation } from "react-router-dom";
import { colors } from "../theme";

const FloatingAssistant = () => {
    const location = useLocation();
    const isOnBotPage = location.pathname === "/bot";

    // Don't show the FAB on the bot page itself
    if (isOnBotPage) {
        return null;
    }

    return (
        <Tooltip title="Chat with Polly" placement="left">
            <Fab
                component={Link}
                to="/bot"
                sx={{
                    position: "fixed",
                    bottom: 24,
                    right: 24,
                    background: `linear-gradient(135deg, ${colors.lime.dim} 0%, rgba(163, 230, 53, 0.2) 100%)`,
                    border: `1px solid ${colors.lime.border}`,
                    color: colors.lime.main,
                    width: 56,
                    height: 56,
                    zIndex: 1000,
                    transition: "all 0.3s ease",
                    "&:hover": {
                        background: `linear-gradient(135deg, ${colors.lime.border} 0%, rgba(163, 230, 53, 0.3) 100%)`,
                        transform: "scale(1.05)",
                        boxShadow: `0 0 20px ${colors.lime.glow}`,
                    },
                }}
            >
                <Box
                    sx={{
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <Box
                        component="img"
                        src="/polli_white.svg"
                        alt="Polly"
                        sx={{
                            width: 28,
                            height: 28,
                            filter: "brightness(0) saturate(100%) invert(79%) sepia(55%) saturate(497%) hue-rotate(44deg) brightness(103%) contrast(101%)",
                        }}
                    />
                    <AutoAwesome
                        sx={{
                            position: "absolute",
                            top: -8,
                            right: -8,
                            fontSize: "14px",
                            color: colors.lime.main,
                            animation: "pulse 2s ease-in-out infinite",
                        }}
                    />
                </Box>
            </Fab>
        </Tooltip>
    );
};

export default FloatingAssistant;
