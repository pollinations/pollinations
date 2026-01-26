import { Close } from "@mui/icons-material";
import {
    Box,
    Dialog,
    DialogContent,
    IconButton,
    Typography,
} from "@mui/material";
import { motion } from "framer-motion";
import { colors, gradients } from "../theme";

const easterEggMessages = [
    {
        title: "🎉 You Found It!",
        message:
            "Use the code 0x3yrTEAPlln with your gsoc application to get a special surprise! Keep exploring!",
        emoji: "🐝",
    },
];

const EasterEggModal = ({ open, onClose }) => {
    const message =
        easterEggMessages[Math.floor(Math.random() * easterEggMessages.length)];

    return (
        <Dialog
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    background: `linear-gradient(135deg, ${colors.lime.dim} 0%, ${colors.lavender.dim} 100%)`,
                    backdropFilter: "blur(20px)",
                    border: `1px solid ${colors.lime.border}`,
                    borderRadius: "20px",
                    boxShadow: `0 8px 32px ${colors.lime.glow}`,
                    overflow: "hidden",
                },
            }}
        >
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, type: "spring" }}
            >
                <DialogContent sx={{ p: 4, position: "relative" }}>
                    <IconButton
                        onClick={onClose}
                        sx={{
                            position: "absolute",
                            right: 12,
                            top: 12,
                            color: "rgba(255,255,255,0.6)",
                            "&:hover": {
                                color: colors.text.primary,
                                backgroundColor: "rgba(255,255,255,0.1)",
                            },
                        }}
                    >
                        <Close />
                    </IconButton>

                    <Box sx={{ textAlign: "center", mt: 2 }}>
                        <motion.div
                            animate={{
                                scale: [1, 1.1, 1],
                                rotate: [0, 10, -10, 0],
                            }}
                            transition={{ duration: 2, repeat: Infinity }}
                            style={{ fontSize: "3rem", marginBottom: "1rem" }}
                        >
                            {message.emoji}
                        </motion.div>

                        <Typography
                            variant="h4"
                            sx={{
                                fontWeight: 700,
                                mb: 2,
                                background: gradients.textAccent,
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                                fontSize: "1.8rem",
                            }}
                        >
                            {message.title}
                        </Typography>

                        <Typography
                            variant="body1"
                            sx={{
                                color: colors.text.secondary,
                                lineHeight: 1.8,
                                fontSize: "1.05rem",
                                mb: 2,
                            }}
                        >
                            {message.message}
                        </Typography>
                    </Box>
                </DialogContent>
            </motion.div>
        </Dialog>
    );
};

export default EasterEggModal;
