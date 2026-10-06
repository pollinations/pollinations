export const isPublicUrl = (value) =>
    typeof value === "string" && publicUrl(value) === value;

export function publicUrl(value) {
    try {
        const url = new URL(value);
        if (
            url.protocol !== "https:" ||
            url.username ||
            url.password ||
            url.hostname === "management.azure.com" ||
            /(?:\.openai\.azure\.com|\.cognitiveservices\.azure\.com|\.services\.ai\.azure\.com)$/.test(
                url.hostname,
            ) ||
            /\/subscriptions\//i.test(url.pathname)
        )
            return null;
        // Public provider catalogs/docs only; configured account endpoints stay private.
        if (
            !/^(?:huggingface\.co|(?:(?:api|docs)\.)?openrouter\.ai|(?:(?:api|docs)\.)?fal\.ai|(?:(?:api|docs)\.)?replicate\.com|gen\.pollinations\.ai|github\.com|prices\.azure\.com|learn\.microsoft\.com|(?:(?:api|docs)\.)?deepinfra\.com|oai\.endpoints\.kepler\.ai\.cloud\.ovh\.net|(?:api|docs)\.x\.ai|(?:api|platform|developers)\.openai\.com|(?:api|docs)\.mistral\.ai|(?:api|docs)\.fireworks\.ai|ai-gateway\.vercel\.sh|dashscope-intl\.aliyuncs\.com|(?:api|docs)\.inferenceport\.ai|(?:api|docs)\.elevenlabs\.io|aiplatform\.googleapis\.com|cloud\.google\.com|ai\.google\.dev|bedrock\.us-east-1\.amazonaws\.com|docs\.aws\.amazon\.com|aws\.amazon\.com|(?:www\.)?assemblyai\.com|platform\.stability\.ai|docs\.perplexity\.ai)$/.test(
                url.hostname,
            )
        )
            return null;
        for (const key of [...url.searchParams.keys()])
            if (
                /(?:key|token|secret|account|subscription|credential|signature|password|authorization)/i.test(
                    key,
                )
            )
                url.searchParams.delete(key);
        return url.href;
    } catch {
        return null;
    }
}
