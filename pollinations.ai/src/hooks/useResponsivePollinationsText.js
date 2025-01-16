import { usePollinationsText } from "@pollinations/react";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

const useResponsivePollinationsText = (prompt, options = {}) => {
    const theme = useTheme();
    const isXs = useMediaQuery(theme.breakpoints.down('xs'));

    const modifiedPrompt = isXs
        ? `drastically reduce text to 2-5 words for mobile. ${prompt}. MAX 2-5 words.`
        : prompt;

    const responsiveTranslatedPrompt = useTranslatedPollinationsText(modifiedPrompt, options);
    return responsiveTranslatedPrompt || prompt;
};

export const useTranslatedPollinationsText = (prompt, options = {}) => {
    const userLanguage = navigator.language || navigator.userLanguage;
    const shouldTranslate = !userLanguage.startsWith('en');
    const modifiedPrompt = `${prompt}.${shouldTranslate ? ` Translate to ${userLanguage}` : ''}`;
    const translatedPrompt = usePollinationsText(modifiedPrompt, options);
    return translatedPrompt || prompt;
};

export default useResponsivePollinationsText;
