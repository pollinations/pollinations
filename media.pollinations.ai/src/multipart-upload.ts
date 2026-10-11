import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import Busboy from "busboy";

const PART_SIZE = 8 * 1024 * 1024;
const INITIAL_BUFFER_SIZE = 64 * 1024;

type UploadBody =
    | { bytes: Uint8Array; temporaryKey?: never }
    | { temporaryKey: string; bytes?: never };

export type StagedMultipartUpload = UploadBody & {
    size: number;
    contentType: string;
    fileName: string;
    requestedId?: string;
    rawTags: string[];
};

export function multipartUploadError(status: 400 | 413, message: string) {
    return Object.assign(new Error(message), { status });
}

async function stageFile(
    file: Readable,
    bucket: R2Bucket,
    maxSize: number,
): Promise<{ size: number } & UploadBody> {
    let part = new Uint8Array(INITIAL_BUFFER_SIZE);
    let partSize = 0;
    let size = 0;
    let upload: R2MultipartUpload | undefined;
    const uploadedParts: R2UploadedPart[] = [];
    const temporaryKey = `pending/${crypto.randomUUID()}`;

    try {
        for await (const chunk of file) {
            const bytes = chunk as Uint8Array;
            size += bytes.byteLength;
            if (size > maxSize) {
                throw multipartUploadError(
                    413,
                    `File too large. Max size: ${maxSize / 1024 / 1024}MB`,
                );
            }

            let offset = 0;
            while (offset < bytes.byteLength) {
                if (partSize === PART_SIZE) {
                    upload ??= await bucket.createMultipartUpload(temporaryKey);
                    uploadedParts.push(
                        await upload.uploadPart(uploadedParts.length + 1, part),
                    );
                    part = new Uint8Array(INITIAL_BUFFER_SIZE);
                    partSize = 0;
                }
                const length = Math.min(
                    PART_SIZE - partSize,
                    bytes.byteLength - offset,
                );
                if (part.length < partSize + length) {
                    const next = new Uint8Array(
                        Math.min(
                            PART_SIZE,
                            Math.max(part.length * 2, partSize + length),
                        ),
                    );
                    next.set(part.subarray(0, partSize));
                    part = next;
                }
                part.set(bytes.subarray(offset, offset + length), partSize);
                partSize += length;
                offset += length;
            }
        }

        if (size === 0) throw multipartUploadError(400, "Empty file");
        if (!upload) return { size, bytes: part.slice(0, partSize) };

        if (partSize > 0) {
            uploadedParts.push(
                await upload.uploadPart(
                    uploadedParts.length + 1,
                    part.subarray(0, partSize),
                ),
            );
        }
        await upload.complete(uploadedParts);
        return { size, temporaryKey };
    } catch (error) {
        if (upload) await upload.abort().catch(() => {});
        await bucket.delete(temporaryKey).catch(() => {});
        throw error;
    }
}

/** Parse the same one-request FormData API without retaining the file in memory. */
export async function stageMultipartUpload(
    request: Request,
    bucket: R2Bucket,
    maxSize: number,
): Promise<StagedMultipartUpload> {
    if (!request.body)
        throw multipartUploadError(
            400,
            "No file provided. Use 'file' field in form-data.",
        );

    let parser: ReturnType<typeof Busboy>;
    try {
        parser = Busboy({
            headers: {
                "content-type": request.headers.get("content-type") || "",
            },
            limits: {
                fieldSize: 8192,
                fields: 20,
                files: 2,
                parts: 22,
                fileSize: maxSize + 1,
                headerPairs: 50,
            },
        });
    } catch {
        throw multipartUploadError(400, "Invalid multipart body");
    }
    let requestedId: string | undefined;
    const rawTags: string[] = [];
    let fileSeen = false;
    let fileResult: StagedMultipartUpload | undefined;
    let fileError: unknown;
    let fileTask: Promise<void> | undefined;

    parser.on("field", (name, value, info) => {
        if (info.nameTruncated || info.valueTruncated) {
            parser.destroy(
                multipartUploadError(400, "Multipart field is too large"),
            );
            return;
        }
        if (name === "id" && requestedId === undefined) requestedId = value;
        if (name === "tags") rawTags.push(value);
    });
    parser.on("file", (name, file, info) => {
        if (name !== "file") {
            file.resume();
            return;
        }
        if (fileSeen) {
            file.resume();
            parser.destroy(
                multipartUploadError(400, "Only one file is supported"),
            );
            return;
        }
        fileSeen = true;
        fileTask = stageFile(file, bucket, maxSize)
            .then((staged) => {
                fileResult = {
                    ...staged,
                    contentType: info.mimeType,
                    fileName: info.filename,
                    rawTags,
                };
            })
            .catch((error) => {
                fileError = error;
                parser.destroy(error);
            });
    });
    for (const event of ["fieldsLimit", "filesLimit", "partsLimit"]) {
        parser.on(event, () => {
            parser.destroy(
                multipartUploadError(400, "Too many multipart fields or files"),
            );
        });
    }

    try {
        await pipeline(
            Readable.fromWeb(
                request.body as unknown as Parameters<
                    typeof Readable.fromWeb
                >[0],
            ),
            parser,
        );
        await fileTask;
        if (fileError) throw fileError;
        if (!fileResult) {
            throw multipartUploadError(
                400,
                "No file provided. Use 'file' field in form-data.",
            );
        }
        return { ...fileResult, requestedId };
    } catch (error) {
        await fileTask;
        if (fileResult?.temporaryKey) {
            await bucket.delete(fileResult.temporaryKey).catch(() => {});
        }
        if (
            fileError &&
            !(
                error instanceof Error &&
                error.message === "Unexpected end of form"
            )
        ) {
            throw fileError;
        }
        if (error instanceof Error && "status" in error) throw error;
        throw multipartUploadError(400, "Invalid multipart body");
    }
}

export async function putStagedMultipartUpload(
    bucket: R2Bucket,
    id: string,
    upload: StagedMultipartUpload,
    options: R2PutOptions,
): Promise<R2Object | null> {
    if (!upload.temporaryKey) {
        if (!upload.bytes) throw new Error("Missing staged upload bytes");
        return bucket.put(id, upload.bytes, options);
    }
    const stagedObject = await bucket.get(upload.temporaryKey);
    if (!stagedObject) throw new Error("Staged media upload disappeared");
    const stream = new FixedLengthStream(upload.size);
    const pipe = stagedObject.body.pipeTo(stream.writable);
    const [stored] = await Promise.all([
        bucket.put(id, stream.readable, options),
        pipe,
    ]);
    return stored;
}
