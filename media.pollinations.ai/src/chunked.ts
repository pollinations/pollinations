/**
 * De-frames an `aws-chunked` HTTP payload stream into raw object bytes.
 * Chunk format: `<hex-size>;chunk-signature=<sig>\r\n<data>\r\n`
 * Terminal chunk: `0;chunk-signature=<sig>\r\n[headers\r\n]\r\n`
 */
export function createAwsChunkedDecoderStream(): TransformStream<Uint8Array, Uint8Array> {
    let buffer = new Uint8Array(0);

    function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
        const c = new Uint8Array(a.length + b.length);
        c.set(a, 0);
        c.set(b, a.length);
        return c;
    }

    function findCRLF(arr: Uint8Array, start = 0): number {
        for (let i = start; i < arr.length - 1; i++) {
            if (arr[i] === 13 && arr[i + 1] === 10) {
                return i;
            }
        }
        return -1;
    }

    return new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
            buffer = concat(buffer, chunk);

            while (true) {
                const crlfIndex = findCRLF(buffer);
                if (crlfIndex === -1) break;

                // Header line: e.g. "10000;chunk-signature=..."
                const headerLine = new TextDecoder().decode(buffer.subarray(0, crlfIndex));
                const semicolonIndex = headerLine.indexOf(";");
                const hexSizeStr = semicolonIndex !== -1 ? headerLine.substring(0, semicolonIndex) : headerLine;
                const chunkSize = parseInt(hexSizeStr.trim(), 16);

                if (isNaN(chunkSize)) {
                    // Invalid chunk size line
                    controller.error(new Error("Invalid aws-chunked encoding"));
                    return;
                }

                if (chunkSize === 0) {
                    // Terminal chunk
                    // Check if we have the trailing CRLF CRLF
                    const doubleCrlfIndex = findCRLF(buffer, crlfIndex + 2);
                    if (doubleCrlfIndex !== -1) {
                        buffer = buffer.subarray(doubleCrlfIndex + 2);
                    }
                    break;
                }

                // Check if buffer contains the full chunk data + trailing CRLF
                const totalChunkLen = crlfIndex + 2 + chunkSize + 2;
                if (buffer.length < totalChunkLen) {
                    // Need more data
                    break;
                }

                // Extract data
                const data = buffer.subarray(crlfIndex + 2, crlfIndex + 2 + chunkSize);
                controller.enqueue(new Uint8Array(data));

                // Advance buffer past chunk data + trailing CRLF
                buffer = buffer.subarray(totalChunkLen);
            }
        },
    });
}

export function decodeAwsChunkedBody(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
    return body.pipeThrough(createAwsChunkedDecoderStream());
}
