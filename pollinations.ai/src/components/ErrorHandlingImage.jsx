import React, { useState, useEffect } from "react";
import { Box, Typography } from "@mui/material";
import { Colors, Fonts } from "../config/global";

/**
 * Custom image component that fetches images and displays API errors
 * Works like a regular <img> tag but can show error messages from the API
 */
export function ErrorHandlingImage({ src, alt, style, ...props }) {
    const [imageData, setImageData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!src) {
            setLoading(false);
            return;
        }

        const fetchImage = async () => {
            try {
                setLoading(true);
                setError(null);

                const response = await fetch(src);

                // Check if response is an error
                if (!response.ok) {
                    // Try to parse error as JSON
                    const contentType = response.headers.get("content-type");
                    if (contentType && contentType.includes("application/json")) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || `HTTP ${response.status}`);
                    } else {
                        const errorText = await response.text();
                        throw new Error(errorText || `HTTP ${response.status}`);
                    }
                }

                // Check if response is JSON (error) or image
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const data = await response.json();
                    if (data.error) {
                        throw new Error(data.error);
                    }
                    // If JSON but no error, something's wrong
                    throw new Error("Unexpected JSON response");
                }

                // It's an image, convert to blob URL
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                setImageData(objectUrl);
            } catch (err) {
                console.error("Image fetch error:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchImage();

        // Cleanup blob URL on unmount
        return () => {
            if (imageData) {
                URL.revokeObjectURL(imageData);
            }
        };
    }, [src]);

    if (loading) {
        return (
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: Colors.offblack2,
                    ...style,
                }}
            >
                <Typography
                    sx={{
                        color: Colors.gray2,
                        fontFamily: Fonts.parameter,
                        fontSize: "0.9em",
                    }}
                >
                    Loading...
                </Typography>
            </Box>
        );
    }

    if (error) {
        return (
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: Colors.offblack2,
                    padding: "20px",
                    ...style,
                }}
            >
                <Typography
                    sx={{
                        color: Colors.red || "#ff4444",
                        fontFamily: Fonts.parameter,
                        fontSize: "1em",
                        fontWeight: "bold",
                        marginBottom: "8px",
                    }}
                >
                    Error
                </Typography>
                <Typography
                    sx={{
                        color: Colors.offwhite,
                        fontFamily: Fonts.parameter,
                        fontSize: "0.9em",
                        textAlign: "center",
                        wordBreak: "break-word",
                    }}
                >
                    {error}
                </Typography>
            </Box>
        );
    }

    if (!imageData) {
        return null;
    }

    return <img src={imageData} alt={alt} style={style} {...props} />;
}
