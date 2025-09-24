import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
    Box,
    Button,
    CircularProgress,
    IconButton,
    InputAdornment,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import UploadIcon from "@mui/icons-material/CloudUpload";
import LinkIcon from "@mui/icons-material/Link";
import CloseIcon from "@mui/icons-material/Close";
import styled from "@emotion/styled";
import { Colors, Fonts } from "../../config/global";

const MAX_REFERENCE_IMAGES = 6;

const ReferenceList = styled(Box)`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
`;

const PreviewWrapper = styled(Box)`
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid ${Colors.offblack};
  background-color: ${Colors.offblack2};
`;

const PreviewImage = styled("img")`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const RemoveButton = styled(IconButton)`
  position: absolute;
  top: -6px;
  right: -6px;
  background-color: ${Colors.offwhite}dd;
  &:hover {
    background-color: ${Colors.offwhite};
  }
`;

function sanitizeUploadUrl(url) {
    if (!url) return null;
    // tmpfiles returns http URLs – prefer https when possible
    if (url.startsWith("http://")) {
        return url.replace("http://", "https://");
    }
    return url;
}

async function uploadFileToTmpFiles(file) {
    // Lightweight anonymous hosting for temporary reference images.
    // The service allows cross-origin uploads and returns a direct URL.
    const endpoint = "https://tmpfiles.org/api/v1/upload";
    const formData = new FormData();
    formData.append("file", file, file.name);

    const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
    }

    const data = await response.json();
    const remoteUrl = sanitizeUploadUrl(data?.data?.url);

    if (data?.status !== "success" || !remoteUrl) {
        throw new Error("Upload service did not return a usable URL");
    }

    return remoteUrl;
}

export const ReferenceImageInput = memo(function ReferenceImageInput({
    images = [],
    onChange,
    disabled = false,
}) {
    const [urlValue, setUrlValue] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    const remainingSlots = useMemo(
        () => Math.max(0, MAX_REFERENCE_IMAGES - images.length),
        [images.length],
    );

    const handleRemove = useCallback(
        (index) => {
            if (!onChange) return;
            const nextImages = images.filter((_, idx) => idx !== index);
            onChange(nextImages);
        },
        [images, onChange],
    );

    const handleAddUrl = useCallback(() => {
        if (!urlValue.trim() || !onChange) return;
        if (remainingSlots === 0) {
            setError(`Maximum of ${MAX_REFERENCE_IMAGES} images reached.`);
            return;
        }
        const trimmed = urlValue.trim();
        onChange([...(images || []), trimmed]);
        setUrlValue("");
        setError(null);
    }, [images, onChange, remainingSlots, urlValue]);

    const handleKeyPress = useCallback(
        (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                handleAddUrl();
            }
        },
        [handleAddUrl],
    );

    const handleFileUpload = useCallback(
        async (event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = ""; // reset input so same file can be selected again

            if (!files.length || !onChange) return;
            if (remainingSlots === 0) {
                setError(`Maximum of ${MAX_REFERENCE_IMAGES} images reached.`);
                return;
            }

            const filesToProcess = files.slice(0, remainingSlots);

            if (files.length > remainingSlots) {
                setError(
                    `Only ${remainingSlots} more image${
                        remainingSlots > 1 ? "s" : ""
                    } can be added.`,
                );
            }

            try {
                setIsUploading(true);
                setError(null);
                const uploadedUrls = [];

                for (const file of filesToProcess) {
                    const remoteUrl = await uploadFileToTmpFiles(file);
                    uploadedUrls.push(remoteUrl);
                }

                if (uploadedUrls.length > 0) {
                    onChange([...(images || []), ...uploadedUrls]);
                }
            } catch (uploadError) {
                console.error("Reference image upload failed", uploadError);
                setError(
                    uploadError.message ||
                        "Unable to upload image. Please try again.",
                );
            } finally {
                setIsUploading(false);
            }
        },
        [images, onChange, remainingSlots],
    );

    const handleUploadButtonClick = useCallback(() => {
        if (disabled || !fileInputRef.current) return;
        fileInputRef.current.click();
    }, [disabled]);

    return (
        <Box
            sx={{
                border: `1px solid ${Colors.offblack}`,
                backgroundColor: Colors.offblack2,
                padding: "12px",
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "8px",
                }}
            >
                <Typography
                    sx={{
                        fontFamily: Fonts.parameter,
                        fontSize: "0.95em",
                        color: Colors.offwhite,
                        fontWeight: 500,
                    }}
                >
                    Reference images
                </Typography>

                <Box sx={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <Tooltip title="Upload images from your device">
                        <span>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={handleUploadButtonClick}
                                disabled={disabled || isUploading || remainingSlots === 0}
                                startIcon={
                                    isUploading ? null : <UploadIcon fontSize="small" />
                                }
                                sx={{
                                    borderColor: Colors.gray2,
                                    color: Colors.offwhite,
                                    '&:hover': { borderColor: Colors.lime },
                                }}
                            >
                                {isUploading ? <CircularProgress size={16} /> : "Upload"}
                            </Button>
                        </span>
                    </Tooltip>
                    <Tooltip title="Add an image URL">
                        <TextField
                            value={urlValue}
                            onChange={(event) => setUrlValue(event.target.value)}
                            onKeyDown={handleKeyPress}
                            placeholder="https://"
                            size="small"
                            disabled={disabled}
                            sx={{
                                minWidth: 200,
                                backgroundColor: Colors.offblack,
                                '& .MuiInputBase-input': {
                                    fontFamily: Fonts.parameter,
                                    fontSize: "0.9em",
                                    color: Colors.offwhite,
                                },
                            }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            aria-label="Add image URL"
                                            size="small"
                                            onClick={handleAddUrl}
                                            disabled={
                                                disabled ||
                                                !urlValue.trim() ||
                                                remainingSlots === 0
                                            }
                                            edge="end"
                                        >
                                            <LinkIcon fontSize="small" />
                                        </IconButton>
                                    </InputAdornment>
                                ),
                            }}
                        />
                    </Tooltip>
                </Box>
            </Box>

            {error && (
                <Typography
                    sx={{
                        color: Colors.lime,
                        fontSize: "0.8em",
                        fontFamily: Fonts.parameter,
                    }}
                >
                    {error}
                </Typography>
            )}

            <ReferenceList>
                {images?.map((imageUrl, index) => (
                    <PreviewWrapper key={`${imageUrl}-${index}`}>
                        <PreviewImage src={imageUrl} alt="reference" loading="lazy" />
                        <RemoveButton
                            size="small"
                            aria-label="Remove reference image"
                            onClick={() => handleRemove(index)}
                        >
                            <CloseIcon fontSize="inherit" />
                        </RemoveButton>
                    </PreviewWrapper>
                ))}
                {images?.length === 0 && (
                    <Typography
                        sx={{
                            fontSize: "0.85em",
                            color: `${Colors.offwhite}aa`,
                            fontFamily: Fonts.parameter,
                        }}
                    >
                        Add up to {MAX_REFERENCE_IMAGES} images to guide compatible models.
                    </Typography>
                )}
            </ReferenceList>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={handleFileUpload}
            />
        </Box>
    );
});

