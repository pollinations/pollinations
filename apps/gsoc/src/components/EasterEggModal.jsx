import { Close } from "@mui/icons-material";
import {
    Box,
    Dialog,
    DialogContent,
    IconButton,
    Typography,
} from "@mui/material";
import { motion } from "framer-motion";

const easterEggMessages = [
    {
        title: "🎉 You Found It!",
        message:
            "Use the code 0x3yrTEAPlln with your gsoc application to get a special surprise! Keep exploring!",
        emoji: "🐝",
    }
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
                    background:
                        "linear-gradient(135deg, rgba(96, 165, 250, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)",
                    backdropFilter: "blur(20px)",
                    border: "1px solid rgba(96, 165, 250, 0.3)",
                    borderRadius: "20px",
                    boxShadow: "0 8px 32px rgba(96, 165, 250, 0.3)",
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
                                color: "#fff",
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
                                background:
                                    "linear-gradient(135deg, #60a5fa, #a78bfa)",
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
                                color: "rgba(255,255,255,0.85)",
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
