import React, {
    useState,
    useEffect,
    memo,
    useRef,
    useCallback,
    useMemo,
} from "react";
import { Box, Typography, TextField, Button, IconButton } from "@mui/material";
import { Colors, Fonts } from "../../config/global";
import { GeneralButton } from "../GeneralButton";
import Grid from "@mui/material/Grid2";
import { ModelSelector } from "./ModelSelector";
import { ParameterNumberInput } from "./ParameterNumberInput";
import { ParameterCheckbox } from "./ParameterCheckbox";
import {
    IMAGE_FEED_ENANCER_TOOLTIP,
    IMAGE_FEED_LOGO_WATERMARK,
    IMAGE_EDIT_BUTTON_OFF,
    IMAGE_FEED_TOOLTIP_MODEL,
    IMAGE_FEED_TOOLTIP_WIDTH,
    IMAGE_FEED_TOOLTIP_HEIGHT,
    IMAGE_FEED_TOOLTIP_SEED,
} from "../../config/copywrite";
import { noLink } from "../../config/llmTransforms";
import { keyframes } from "@emotion/react";
import { LLMTextManipulator } from "../LLMTextManipulator";
import { getImageURL } from "../../utils/getImageURL";
import { trackEvent } from "../../config/analytics";
import CloseIcon from "@mui/icons-material/Close";
import {
    modelSupportsImageInput,
    MAX_REFERENCE_IMAGES,
} from "../../config/imageModels";

// ─── PARAMETER STYLING CONSTANTS ────────────────────────────────────────────────
// These can be adjusted to control the appearance of all parameter inputs
const PARAM_STYLES = {
    backgroundColor: Colors.offwhite,
    textColor: Colors.offblack,
    borderColor: Colors.offblack,
    borderColorHover: Colors.lime,
    labelColor: `${Colors.offwhite}99`,
    checkboxColorOn: Colors.offblack,
    checkboxColorOff: Colors.offblack,
};

const normalizeImageList = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.filter(Boolean).slice(0, MAX_REFERENCE_IMAGES);
    }

    if (typeof value === "string") {
        return value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, MAX_REFERENCE_IMAGES);
    }

    return [];
};

/**
 * ImageEditor
 * A component used to manage image parameters such as model, width/height, seed, etc.
 * Accepts editing or read-only mode based on the `toggleValue` prop.
 */
export const ImageEditor = memo(function ImageEditor({
    image,
    handleFocus,
    isLoading,
    setIsInputChanged,
    isInputChanged,
    isStopped,
    toggleValue,
    stop,
    cancelLoading,
    updateImage,
    handleToggleChange,
}) {
    // ─── LOCAL STATE ─────────────────────────────────────────────────────────────
    // Initialize with default values for numeric inputs
    const [imageParams, setImageParams] = useState({
        width: 512,
        height: 512,
        seed: 0,
        enhance: false,
        nologo: false,
        model: "flux",
        image: [],
    });
    const imageParamsRef = useRef(imageParams); // Reference to current state for use in callbacks
    const initializedRef = useRef(false); // Track if we've initialized from props

    // ─── EFFECTS ─────────────────────────────────────────────────────────────────
    // Load image parameters into local state whenever `image` changes
    useEffect(() => {
        // Only set parameters from image if:
        // 1. We haven't initialized yet, or
        // 2. The image URL has changed (indicating a completely new image)
        if (
            !initializedRef.current ||
            (image && image.imageURL !== imageParamsRef.current.imageURL)
        ) {
            setImageParams((prevParams) => {
                const nextParams = {
                    ...prevParams,
                    ...(image || {}),
                };

                if ("image" in (image || {})) {
                    nextParams.image = normalizeImageList(image.image);
                }

                if (!nextParams.image) {
                    nextParams.image = prevParams.image || [];
                }

                return nextParams;
            });
            initializedRef.current = true;
        } else if (image && image.prompt !== imageParamsRef.current.prompt) {
            // Always update the prompt value when it changes in the parent
            console.log("Updating prompt from parent:", image.prompt);
            setImageParams((prevParams) => ({
                ...prevParams,
                prompt: image.prompt,
            }));
        }
    }, [image]);

    // Update the ref whenever local imageParams changes
    useEffect(() => {
        imageParamsRef.current = imageParams;
    }, [imageParams]);

    // Destructuring parameters from imageParams
    const {
        width,
        height,
        seed,
        enhance = false,
        nologo = false,
        model,
        image: referenceImages = [],
    } = imageParams;

    const supportsImageInput = useMemo(() => {
        if (!model) return false;
        return modelSupportsImageInput(model);
    }, [model]);

    const [imageUrlInput, setImageUrlInput] = useState("");

    const remainingImageSlots = Math.max(
        0,
        MAX_REFERENCE_IMAGES - (referenceImages?.length || 0),
    );

    useEffect(() => {
        if (!supportsImageInput) {
            setImageUrlInput("");
        }
    }, [supportsImageInput]);

    // ─── HANDLERS: INPUT ────────────────────────────────────────────────────────
    /**
     * handleInputChange
     * Generic handler for textfield changes in width, height, and seed (numbers).
     * Also toggles booleans for "enhance" or "nologo."
     */
    const handleInputChange = (param, value) => {
        let newValue;
        if (param === "model") {
            newValue = value;
        } else if (param === "enhance" || param === "nologo") {
            // Force the value for checkbox to be a boolean
            newValue = Boolean(value);
        } else {
            const parsedValue = parseInt(value, 10);
            newValue = isNaN(parsedValue) ? "" : parsedValue;
        }

        // Set "input changed" state if the new value differs from the old one
        if (imageParams[param] !== newValue) {
            setIsInputChanged(true);
        }
        handleParamChange(param, newValue);

        // Track event for input changes (excluding width and height, which are tracked onBlur)
        if (
            typeof trackEvent === "function" &&
            param !== "width" &&
            param !== "height"
        ) {
            trackEvent({
                action: `change_${param}`,
                category: "feed",
                value: newValue,
            });
        }
    };

    // ─── BUTTON CLICK ───────────────────────────────────────────────────────────
    /**
     * handleButtonClick
     * Cancels loading if the button is clicked while loading.
     * Increments seed if no changes were made and triggers handleSubmit.
     */
    const handleButtonClick = () => {
        if (isLoading) {
            cancelLoading();
            return;
        }

        if (!isInputChanged) {
            // Track event for generating with bumped seed
            if (typeof trackEvent === "function") {
                trackEvent({
                    category: "feed",
                    action: "click_create_bump_seed",
                });
            }
            // If no changes, bump seed for a new random value
            setImageParams((prevParams) => ({
                ...prevParams,
                seed: (prevParams.seed || 0) + 1,
            }));
        } else {
            // Track event for submitting generate
            if (typeof trackEvent === "function") {
                trackEvent({
                    category: "feed",
                    action: "click_create",
                });
            }
        }

        // Defer the submit call slightly to ensure state updates are captured
        setTimeout(handleSubmit, 250);
    };

    // ─── HANDLERS: PARAM UPDATE AND SUBMIT ─────────────────────────────────────
    /**
     * handleParamChange
     * Updates local imageParams state and triggers the `stop` function if the image
     * is not currently stopped (to allow editing).
     */
    const handleParamChange = useCallback(
        (param, value) => {
            setIsInputChanged(true);
            if (!isStopped) {
                stop(true);
            }
            console.log(`Changing parameter ${param} to:`, value);
            setImageParams((prevParams) => ({
                ...prevParams,
                [param]: value,
            }));
        },
        [isStopped, stop, setIsInputChanged],
    );

    const handleImageUrlAdd = useCallback(() => {
        const trimmedValue = imageUrlInput.trim();
        if (!trimmedValue || remainingImageSlots <= 0) {
            return;
        }

        const updatedImages = [...(referenceImages || []), trimmedValue];
        handleParamChange("image", updatedImages);
        setImageUrlInput("");

        if (typeof trackEvent === "function") {
            trackEvent({
                category: "feed",
                action: "add_reference_image",
            });
        }
    }, [
        imageUrlInput,
        remainingImageSlots,
        referenceImages,
        handleParamChange,
    ]);

    const handleReferenceImageRemove = useCallback(
        (index) => {
            const updatedImages = (referenceImages || []).filter(
                (_, idx) => idx !== index,
            );
            handleParamChange("image", updatedImages);

            if (typeof trackEvent === "function") {
                trackEvent({
                    category: "feed",
                    action: "remove_reference_image",
                });
            }
        },
        [referenceImages, handleParamChange],
    );

    /**
     * handleSubmit
     * Builds updated image parameters into a URL and calls the provided
     * updateImage callback with the new parameters.
     */
    const handleSubmit = useCallback(() => {
        const currentImageParams = imageParamsRef.current;

        // Always use the most up-to-date prompt from props if available
        // This ensures edited prompts from the parent are picked up
        const finalParams = {
            ...currentImageParams,
            prompt: image?.prompt || currentImageParams.prompt || "",
        };

        const imageURL = getImageURL(finalParams);

        // Make sure to include all necessary parameters, especially prompt
        updateImage({
            ...finalParams,
            imageURL,
        });
    }, [updateImage, image?.prompt]);

    // ─── STYLES: BUTTONS, MENU, ANIMATIONS ─────────────────────────────────────

    const blinkAnimation = keyframes`
    0% {
      background-color: ${Colors.offblack};
      color: ${Colors.lime};
    }
    50% {
      background-color: ${Colors.lime}B3;
      color: ${Colors.offblack}B3;
    }
    100% {
      background-color: ${Colors.offblack}B3;
      color: ${Colors.lime}B3;
    }
  `;

    return (
        <Box
            sx={{
                border: "none",
                boxShadow: "none",
                backgroundColor: "transparent",
            }}
        >
            <Grid container spacing={2}>
                {/* Conditional Rendering of Controls in Edit Mode */}
                {toggleValue === "edit" && (
                    <>
                        {/* Model Selector */}
                        <Grid size={{ xs: 12, sm: 4, md: 2 }}>
                            <ModelSelector
                                itemType="image"
                                currentModel={model || "flux"}
                                onModelChange={(value) =>
                                    handleInputChange("model", value)
                                }
                                isLoading={isLoading}
                                onFocus={handleFocus}
                                tooltipText={null}
                                setIsInputChanged={setIsInputChanged}
                            />
                        </Grid>

                        {/* Width Input */}
                        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                            <ParameterNumberInput
                                label="Width"
                                value={width}
                                onChange={(value) =>
                                    handleInputChange("width", value)
                                }
                                onFocus={handleFocus}
                                tooltipText={null}
                                paramName="width"
                                setIsInputChanged={setIsInputChanged}
                                styles={PARAM_STYLES}
                            />
                        </Grid>

                        {/* Height Input */}
                        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                            <ParameterNumberInput
                                label="Height"
                                value={height}
                                onChange={(value) =>
                                    handleInputChange("height", value)
                                }
                                onFocus={handleFocus}
                                tooltipText={null}
                                paramName="height"
                                setIsInputChanged={setIsInputChanged}
                                styles={PARAM_STYLES}
                            />
                        </Grid>

                        {/* Seed Input */}
                        <Grid size={{ xs: 4, sm: 4, md: 2 }}>
                            <ParameterNumberInput
                                label="Seed"
                                value={seed}
                                onChange={(value) =>
                                    handleInputChange("seed", value)
                                }
                                onFocus={handleFocus}
                                tooltipText={IMAGE_FEED_TOOLTIP_SEED}
                                paramName="seed"
                                setIsInputChanged={setIsInputChanged}
                                styles={PARAM_STYLES}
                            />
                        </Grid>

                        {/* Enhance Checkbox */}
                        <Grid size={{ xs: 4, sm: 2, md: 1 }}>
                            <ParameterCheckbox
                                label="Enhance"
                                checked={enhance}
                                onChange={(value) =>
                                    handleInputChange("enhance", value)
                                }
                                onFocus={handleFocus}
                                tooltipText={IMAGE_FEED_ENANCER_TOOLTIP}
                                paramName="enhance"
                                setIsInputChanged={setIsInputChanged}
                                styles={PARAM_STYLES}
                            />
                        </Grid>

                        {/* Logo Checkbox */}
                        <Grid size={{ xs: 4, sm: 2, md: 1 }}>
                            <ParameterCheckbox
                                label="Logo"
                                checked={!nologo}
                                onChange={(value) =>
                                    handleInputChange("nologo", !value)
                                }
                                onFocus={handleFocus}
                                tooltipText={IMAGE_FEED_LOGO_WATERMARK}
                                paramName="nologo"
                                setIsInputChanged={setIsInputChanged}
                                styles={PARAM_STYLES}
                            />
                        </Grid>

                        {supportsImageInput && (
                            <Grid size={{ xs: 12 }}>
                                <Box
                                    sx={{
                                        backgroundColor: Colors.offblack2,
                                        border: `1px solid ${Colors.gray2}33`,
                                        borderRadius: "10px",
                                        padding: "16px",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "12px",
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
                                                color: Colors.offwhite,
                                                fontFamily: Fonts.parameter,
                                                fontSize: "0.95em",
                                                letterSpacing: "0.02em",
                                            }}
                                        >
                                            Reference images
                                        </Typography>
                                        <Typography
                                            sx={{
                                                color: `${Colors.offwhite}80`,
                                                fontFamily: Fonts.parameter,
                                                fontSize: "0.8em",
                                            }}
                                        >
                                            {`${referenceImages.length}/${MAX_REFERENCE_IMAGES} images`}
                                        </Typography>
                                    </Box>

                                    {referenceImages.length > 0 && (
                                        <Box
                                            sx={{
                                                display: "flex",
                                                flexWrap: "wrap",
                                                gap: "12px",
                                            }}
                                        >
                                            {referenceImages.map((img, index) => (
                                                <Box
                                                    key={`${img}-${index}`}
                                                    sx={{
                                                        position: "relative",
                                                        width: "72px",
                                                        height: "72px",
                                                        borderRadius: "8px",
                                                        overflow: "hidden",
                                                        border: `1px solid ${Colors.gray2}66`,
                                                        backgroundColor: Colors.offblack,
                                                    }}
                                                >
                                                    <Box
                                                        component="img"
                                                        src={img}
                                                        alt={`reference-${index + 1}`}
                                                        sx={{
                                                            width: "100%",
                                                            height: "100%",
                                                            objectFit: "cover",
                                                        }}
                                                    />
                                                    <IconButton
                                                        size="small"
                                                        onClick={() =>
                                                            handleReferenceImageRemove(index)
                                                        }
                                                        sx={{
                                                            position: "absolute",
                                                            top: 4,
                                                            right: 4,
                                                            backgroundColor: `${Colors.offblack}CC`,
                                                            color: Colors.offwhite,
                                                            "&:hover": {
                                                                backgroundColor: `${Colors.offblack}F2`,
                                                            },
                                                        }}
                                                    >
                                                        <CloseIcon sx={{ fontSize: "16px" }} />
                                                    </IconButton>
                                                </Box>
                                            ))}
                                        </Box>
                                    )}

                                    <Box
                                        sx={{
                                            display: "flex",
                                            gap: "12px",
                                            flexWrap: "wrap",
                                            alignItems: "center",
                                        }}
                                    >
                                        <TextField
                                            value={imageUrlInput}
                                            onChange={(event) =>
                                                setImageUrlInput(event.target.value)
                                            }
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                    event.preventDefault();
                                                    handleImageUrlAdd();
                                                }
                                            }}
                                            placeholder="Paste image URL"
                                            size="small"
                                            disabled={remainingImageSlots <= 0}
                                            sx={{
                                                flex: 1,
                                                minWidth: "200px",
                                                "& .MuiOutlinedInput-root": {
                                                    backgroundColor: Colors.offblack,
                                                    color: Colors.offwhite,
                                                    fontFamily: Fonts.parameter,
                                                    fontSize: "0.9em",
                                                    "& fieldset": {
                                                        borderColor: `${Colors.gray2}66`,
                                                    },
                                                    "&:hover fieldset": {
                                                        borderColor: Colors.lime,
                                                    },
                                                    "&.Mui-focused fieldset": {
                                                        borderColor: Colors.lime,
                                                    },
                                                },
                                                "& .MuiOutlinedInput-input::placeholder": {
                                                    color: `${Colors.offwhite}80`,
                                                    opacity: 1,
                                                },
                                            }}
                                        />
                                        <Button
                                            variant="outlined"
                                            onClick={handleImageUrlAdd}
                                            disabled={
                                                remainingImageSlots <= 0 ||
                                                imageUrlInput.trim() === ""
                                            }
                                            sx={{
                                                borderColor: Colors.lime,
                                                color: Colors.lime,
                                                fontFamily: Fonts.parameter,
                                                textTransform: "none",
                                                "&:hover": {
                                                    borderColor: Colors.lime,
                                                    backgroundColor: `${Colors.lime}26`,
                                                },
                                            }}
                                        >
                                            Add image
                                        </Button>
                                    </Box>

                                    <Typography
                                        sx={{
                                            color: `${Colors.offwhite}66`,
                                            fontFamily: Fonts.parameter,
                                            fontSize: "0.75em",
                                            lineHeight: 1.6,
                                        }}
                                    >
                                        Works best with models like nanobanana, seedream,
                                        or kontext. Paste direct image links to guide the
                                        generation.
                                    </Typography>
                                </Box>
                            </Grid>
                        )}

                        {/* Submit Button */}
                        <Grid
                            size={{ xs: 12, sm: 4, md: 2 }}
                            style={{ marginTop: "24px" }}
                        >
                            <GeneralButton
                                handleClick={handleButtonClick}
                                isLoading={isLoading}
                                isInputChanged={isInputChanged}
                                borderColor={Colors.lime}
                                backgroundColor={Colors.offblack}
                                textColor={Colors.lime}
                                fontSize="1.5em"
                                style={{
                                    width: "100%",
                                    height: "60px",
                                    fontFamily: Fonts.title,
                                }}
                            >
                                <LLMTextManipulator
                                    text={IMAGE_EDIT_BUTTON_OFF}
                                    transforms={[noLink]}
                                />
                            </GeneralButton>
                        </Grid>
                    </>
                )}
            </Grid>
        </Box>
    );
});
