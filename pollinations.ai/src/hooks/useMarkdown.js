import fm from "front-matter";
import { useMemo } from "react";

const useMarkdown = (rawText) => {
    const content = useMemo(() => fm(rawText), [rawText]);
    return {
        meta: content?.attributes,
        body: content?.body,
    };
};

export default useMarkdown;
