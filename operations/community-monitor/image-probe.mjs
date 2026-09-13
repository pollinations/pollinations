// 512x512 RGB PNG: a black square on white. No external host or user data.
const EDIT_IMAGE =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAFpUlEQVR42u3VwQ0AMAgDscL+O9MleLRgjxBFuiwAVsoDwEoCACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACACAAJgAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAPhAMJqHIwAACACAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACACAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgAgACYAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEgH7FaB6OAAAgAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAIAAmABAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABABAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABABAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAAHnUBjSbeaqcV6PMAAAAASUVORK5CYII=";

export function nextImageOperation(model, previousOperation) {
    return model.input_modalities?.includes("image") &&
        previousOperation !== "edit"
        ? "edit"
        : "generate";
}

export function imageProbeRequest(model, marker, operation) {
    const edit = operation === "edit";
    return {
        requestPath: edit ? "/v1/images/edits" : "/v1/images/generations",
        body: {
            model: model.name,
            prompt: edit
                ? `Change the black square to blue. Add the label ${marker}.`
                : `A plain test card labeled ${marker}`,
            n: 1,
            ...(edit ? { image: EDIT_IMAGE } : { response_format: "b64_json" }),
        },
    };
}

export function imageProbeResult(response, body, requestedModel) {
    let parsed;
    try {
        parsed = JSON.parse(body);
    } catch {
        // An invalid successful body is reported as INVALID below.
    }
    const imageBase64 = parsed?.data?.[0]?.b64_json;
    const hasImage =
        typeof imageBase64 === "string" &&
        Buffer.from(imageBase64, "base64").byteLength > 100;
    const modelUsed = response.headers.get("x-model-used");
    return {
        ok: response.ok && hasImage,
        status: response.ok && !hasImage ? "INVALID" : response.status,
        httpStatus: response.status,
        requestId: response.headers.get("x-request-id"),
        modelUsed,
        fallbackUsed: modelUsed ? modelUsed !== requestedModel : null,
        usage: parsed?.usage,
        // Source attribution is not fault attribution: upstream 4xx can still
        // be invalid input or a content-policy refusal. Keep it for diagnosis.
        upstreamStatus: parsed?.error?.details?.upstreamStatus ?? null,
        errorCode: parsed?.error?.code ?? null,
        detail: response.ok
            ? hasImage
                ? undefined
                : "successful response did not contain a valid b64_json image"
            : typeof parsed?.error?.message === "string"
              ? parsed.error.message.slice(0, 300)
              : `image request failed with HTTP ${response.status}`,
    };
}
