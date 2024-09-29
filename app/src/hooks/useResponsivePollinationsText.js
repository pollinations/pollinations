import { usePollinationsText } from "@pollinations/react";
import useIsMobile from "./useIsMobile"; // Import the useIsMobile hook

const useResponsivePollinationsText = (prompt, options = {}) => {
    const isMobile = useIsMobile(); // Use the useIsMobile hook
    const modifiedPrompt = isMobile ? `drastically reduce text to 2-5 words for mobile. ${prompt}. MAX 2-5 words` : prompt;
    console.log("responsive prompt", modifiedPrompt, "isMobile", isMobile)
    return usePollinationsText(modifiedPrompt, options);
};

export default useResponsivePollinationsText;