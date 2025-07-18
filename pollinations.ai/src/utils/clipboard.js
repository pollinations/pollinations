/**
 * Utility for safely copying text to clipboard with fallback for mobile devices
 */

/**
 * Copy text to clipboard with fallback for browsers that don't support the Clipboard API
 * @param {string} text - The text to copy to clipboard
 * @returns {Promise<boolean>} - Whether the operation was successful
 */
export const copyToClipboard = async (text) => {
    // Check if the Clipboard API is available
    if (
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
    ) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            console.warn("Clipboard API failed:", error);
            // Fall back to alternative method
        }
    }

    // Fallback method for mobile browsers that don't support Clipboard API
    try {
        // Create temporary textarea element
        const textArea = document.createElement("textarea");
        textArea.value = text;

        // Make the textarea out of viewport
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";

        document.body.appendChild(textArea);

        // Focus and select the text
        textArea.focus();
        textArea.select();

        // Execute copy command
        const successful = document.execCommand("copy");

        // Clean up
        document.body.removeChild(textArea);

        return successful;
    } catch (error) {
        console.error("Fallback clipboard method failed:", error);
        return false;
    }
};
