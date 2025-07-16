import { useState } from "react";
import { Box, IconButton } from "@mui/material";
import { CodeBlock, paraisoDark } from "react-code-blocks";
import { Colors, Fonts } from "../../config/global";
import React from "react";
import FileCopyIcon from "@mui/icons-material/FileCopy";
import CODE_EXAMPLES from "../../config/codeExamplesText";
import { SectionSubContainer } from "../SectionContainer";
import TabSelector from "../TabSelector";
import { copyToClipboard } from "../../utils/clipboard";

export function CodeExamples({ image = {} }) {
    const [tabValue, setTabValue] = useState(0);
    const [copiedIndex, setCopiedIndex] = useState(null);
    const codeExampleTabs = Object.keys(CODE_EXAMPLES);

    const handleTabChange = (tabKey) => {
        const index = codeExampleTabs.indexOf(tabKey);
        if (index !== -1) {
            setTabValue(index);
        }
    };

    const handleCopy = (text, index) => {
        copyToClipboard(text)
            .then((success) => {
                if (success) {
                    console.log("Code copied to clipboard!");
                    setCopiedIndex(index);
                    setTimeout(() => setCopiedIndex(null), 2000);
                } else {
                    console.warn("Failed to copy code to clipboard");
                }
            })
            .catch((error) => {
                console.error("Error copying to clipboard:", error);
            });
    };

    // Default values for when image is not available
    const defaultImage = {
        prompt: "A beautiful landscape",
        width: 1024,
        height: 1024,
        seed: 42,
        model: "flux",
        imageURL:
            "https://image.pollinations.ai/prompt/A%20beautiful%20landscape",
    };

    // Use either the provided image or default values
    const imageToUse = image?.imageURL ? image : defaultImage;

    // Create formatted tab items with title and key using the category field
    const formattedTabs = codeExampleTabs.map((tab) => ({
        key: tab,
        title: CODE_EXAMPLES[tab].category,
    }));

    return (
        <SectionSubContainer
            style={{ backgroundColor: "transparent", paddingBottom: "0em" }}
        >
            <TabSelector
                items={formattedTabs}
                selectedKey={codeExampleTabs[tabValue]}
                onSelectTab={handleTabChange}
                trackingCategory="integrate"
                trackingAction="select_code_category"
            />

            <>
                {codeExampleTabs.map((key, index) => {
                    if (tabValue !== index) return null;

                    const { code, language } = CODE_EXAMPLES[key];
                    const text = code(imageToUse);

                    return (
                        <Box
                            key={key}
                            position="relative"
                            style={{ width: "100%" }}
                        >
                            <Box display="flex" justifyContent="flex-start">
                                <IconButton
                                    onClick={() => handleCopy(text, index)}
                                    sx={{
                                        textAlign: "left",
                                        color: Colors.offwhite,
                                        fontFamily: Fonts.title,
                                        fontWeight: 600,
                                        textTransform: "uppercase",
                                        marginLeft: "1em",
                                        fontSize: "1em",
                                        "&:hover": {
                                            backgroundColor: "transparent",
                                            color:
                                                copiedIndex === index
                                                    ? Colors.offwhite
                                                    : Colors.lime,
                                        },
                                    }}
                                >
                                    {copiedIndex === index
                                        ? <b>COPIED! ✅</b>
                                        : <b>COPY</b>}
                                </IconButton>
                            </Box>
                            <SectionSubContainer paddingBottom="0em">
                                <CodeBlock
                                    text={text}
                                    language={language}
                                    showLineNumbers={
                                        text.split("\n").length > 1
                                    }
                                    theme={paraisoDark}
                                    customStyle={{
                                        backgroundColor: "transparent",
                                        color: Colors.offwhite,
                                        width: "100%",
                                        height: "auto",
                                        border: `0px`,
                                        boxShadow: "none",
                                        overflowX: "hidden",
                                        overflowY: "hidden",
                                        fontFamily: Fonts.parameter,
                                    }}
                                />
                            </SectionSubContainer>
                        </Box>
                    );
                })}
            </>
        </SectionSubContainer>
    );
}
