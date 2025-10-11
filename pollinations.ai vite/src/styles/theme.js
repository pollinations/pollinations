import { createTheme } from "@mui/material/styles";
import { Colors, Fonts } from "../config/global";

/**
 * Custom theme for Material UI components
 * This theme coordinates with your existing color scheme and fonts
 */
export const theme = createTheme({
    palette: {
        mode: "dark",
        primary: {
            main: Colors.lime,
        },
        secondary: {
            main: Colors.offwhite,
        },
        background: {
            default: Colors.offblack,
            paper: Colors.offblack2,
        },
        text: {
            primary: Colors.offwhite,
            secondary: Colors.gray1,
        },
        error: {
            main: Colors.special,
        },
    },
    typography: {
        fontFamily: Fonts.parameter,
        h1: {
            fontFamily: Fonts.title,
        },
        h2: {
            fontFamily: Fonts.title,
        },
        h3: {
            fontFamily: Fonts.headline,
        },
        h4: {
            fontFamily: Fonts.headline,
        },
        h5: {
            fontFamily: Fonts.headline,
        },
        h6: {
            fontFamily: Fonts.headline,
        },
        button: {
            fontFamily: Fonts.parameter,
            textTransform: "none",
        },
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                },
                contained: {
                    backgroundColor: Colors.lime,
                    color: Colors.offblack,
                    "&:hover": {
                        backgroundColor: `${Colors.lime}cc`,
                    },
                },
                outlined: {
                    borderColor: Colors.lime,
                    color: Colors.lime,
                    "&:hover": {
                        borderColor: Colors.lime,
                        backgroundColor: `${Colors.lime}22`,
                    },
                },
            },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    "& .MuiOutlinedInput-root": {
                        "& fieldset": {
                            borderColor: `${Colors.lime}66`,
                        },
                        "&:hover fieldset": {
                            borderColor: `${Colors.lime}aa`,
                        },
                        "&.Mui-focused fieldset": {
                            borderColor: Colors.lime,
                        },
                    },
                },
            },
        },
        MuiSlider: {
            styleOverrides: {
                thumb: {
                    color: Colors.lime,
                },
                track: {
                    color: Colors.lime,
                },
                rail: {
                    color: `${Colors.lime}44`,
                },
            },
        },
    },
});
