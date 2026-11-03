// Bounded, metadata-only GLB 2.0 inspection. It does not decode geometry or render.
export const MAX_GLB_BYTES = 32 * 1024 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const COMPONENT_BYTES = {
    5120: 1,
    5121: 1,
    5122: 2,
    5123: 2,
    5125: 4,
    5126: 4,
};
const TYPE_COMPONENTS = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
    MAT2: 4,
    MAT3: 9,
    MAT4: 16,
};

const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const natural = (n) => Number.isSafeInteger(n) && n >= 0;
const idx = (n, length) => natural(n) && n < length;

export function inspectGlb(bytes) {
    const report = {
        format: "GLB 2.0",
        fileBytes: bytes.byteLength,
        structurallyValid: false,
        selfContained: true,
        summary: {
            meshes: 0,
            primitives: 0,
            triangles: 0,
            triangleCountComplete: true,
            nodes: 0,
            scenes: 0,
            materials: 0,
            textures: 0,
            images: 0,
            animations: 0,
            accessors: 0,
        },
        declaredLocalBounds: null,
        errors: [],
        warnings: [],
    };
    const error = (message) => report.errors.push(message);
    const warn = (message) => report.warnings.push(message);
    const finish = () => {
        report.structurallyValid = report.errors.length === 0;
        return report;
    };

    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_GLB_BYTES) {
        error("Input must be GLB bytes within the 32 MiB limit.");
        return finish();
    }
    if (bytes.byteLength < 20) {
        error("Truncated GLB header or JSON chunk.");
        return finish();
    }
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const read = (offset) => v.getUint32(offset, true);
    if (read(0) !== 0x46546c67) error("Missing GLB magic.");
    if (read(4) !== 2) error("Only GLB version 2 is supported.");
    if (read(8) !== bytes.byteLength)
        error("Declared GLB length differs from actual bytes.");
    if (report.errors.length) return finish();

    let offset = 12;
    let json = null;
    let bin = null;
    let chunkNumber = 0;
    while (offset < bytes.byteLength) {
        if (bytes.byteLength - offset < 8) {
            error("Truncated GLB chunk header.");
            break;
        }
        const length = read(offset);
        const type = read(offset + 4);
        offset += 8;
        if (length % 4 !== 0 || length > bytes.byteLength - offset) {
            error("Invalid GLB chunk length or alignment.");
            break;
        }
        if (chunkNumber === 0 && type !== JSON_CHUNK) {
            error("The first GLB chunk must be JSON.");
        }
        if (type === JSON_CHUNK) {
            if (json) error("Duplicate GLB JSON chunk.");
            else json = bytes.subarray(offset, offset + length);
        } else if (type === BIN_CHUNK) {
            if (bin) error("Duplicate GLB binary chunk.");
            else bin = bytes.subarray(offset, offset + length);
        } else {
            warn("Unknown GLB chunk type was skipped.");
        }
        offset += length;
        chunkNumber++;
    }
    if (offset !== bytes.byteLength)
        error("GLB chunk layout does not match file length.");
    if (!json) error("Missing GLB JSON chunk.");
    if (report.errors.length) return finish();
    if (json.byteLength > MAX_JSON_BYTES) {
        error("GLB JSON chunk exceeds the 4 MiB inspection limit.");
        return finish();
    }

    let doc;
    try {
        doc = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(json).trimEnd(),
        );
    } catch {
        error("GLB JSON is invalid or not UTF-8.");
        return finish();
    }
    if (!object(doc) || !object(doc.asset) || doc.asset.version !== "2.0") {
        error("glTF asset.version must be 2.0.");
        return finish();
    }
    report.generator =
        typeof doc.asset.generator === "string"
            ? doc.asset.generator.slice(0, 160)
            : null;

    const keys = [
        "buffers",
        "bufferViews",
        "accessors",
        "meshes",
        "nodes",
        "scenes",
        "materials",
        "textures",
        "images",
        "animations",
    ];
    for (const key of keys) {
        if (doc[key] !== undefined && !Array.isArray(doc[key]))
            error(`${key} must be an array.`);
        if (Array.isArray(doc[key]) && doc[key].length > 100000) {
            error(`${key} has too many entries.`);
        }
    }
    if (report.errors.length) return finish();
    const arrays = Object.fromEntries(keys.map((key) => [key, doc[key] ?? []]));
    const {
        buffers,
        bufferViews,
        accessors,
        meshes,
        nodes,
        scenes,
        materials,
        textures,
        images,
        animations,
    } = arrays;
    Object.assign(report.summary, {
        meshes: meshes.length,
        nodes: nodes.length,
        scenes: scenes.length,
        materials: materials.length,
        textures: textures.length,
        images: images.length,
        animations: animations.length,
        accessors: accessors.length,
    });

    if (doc.scene !== undefined && !idx(doc.scene, scenes.length)) {
        error("Default scene index is out of range.");
    }
    buffers.forEach((buffer, i) => {
        if (!object(buffer) || !natural(buffer.byteLength)) {
            error(`buffers[${i}] has invalid byteLength.`);
            return;
        }
        if (buffer.uri !== undefined) {
            if (
                typeof buffer.uri === "string" &&
                !buffer.uri.startsWith("data:")
            )
                report.selfContained = false;
            if (typeof buffer.uri !== "string")
                error(`buffers[${i}].uri must be a string.`);
        } else if (
            i !== 0 ||
            !bin ||
            buffer.byteLength > bin.byteLength ||
            bin.byteLength - buffer.byteLength > 3
        ) {
            error(`buffers[${i}] does not match the embedded BIN chunk.`);
        }
    });
    if (bin && buffers.length === 0)
        warn("Embedded binary chunk has no declared buffer.");
    if (bin && buffers[0]?.uri !== undefined) {
        warn("BIN chunk is present but buffers[0] specifies an external URI.");
    }
    bufferViews.forEach((view, i) => {
        if (
            !object(view) ||
            !idx(view.buffer, buffers.length) ||
            !natural(view.byteLength) ||
            !natural(view.byteOffset ?? 0)
        ) {
            error(`bufferViews[${i}] has invalid buffer or byte range.`);
            return;
        }
        if (
            !object(buffers[view.buffer]) ||
            view.byteOffset + view.byteLength > buffers[view.buffer].byteLength
        ) {
            error(`bufferViews[${i}] exceeds its buffer.`);
        }
        if (
            view.byteStride !== undefined &&
            (!natural(view.byteStride) ||
                view.byteStride < 4 ||
                view.byteStride > 252)
        ) {
            error(`bufferViews[${i}] has invalid byteStride.`);
        }
    });
    accessors.forEach((accessor, i) => {
        if (
            !object(accessor) ||
            !natural(accessor.count) ||
            !COMPONENT_BYTES[accessor.componentType] ||
            !TYPE_COMPONENTS[accessor.type]
        ) {
            error(`accessors[${i}] has invalid type, componentType or count.`);
            return;
        }
        if (accessor.bufferView === undefined && !accessor.sparse) {
            error(`accessors[${i}] has neither bufferView nor sparse data.`);
        }
        if (accessor.bufferView !== undefined) {
            if (!idx(accessor.bufferView, bufferViews.length)) {
                error(`accessors[${i}] references an invalid bufferView.`);
            } else if (
                natural(accessor.byteOffset ?? 0) &&
                TYPE_COMPONENTS[accessor.type] <= 4 &&
                object(bufferViews[accessor.bufferView])
            ) {
                const view = bufferViews[accessor.bufferView];
                const elementBytes =
                    COMPONENT_BYTES[accessor.componentType] *
                    TYPE_COMPONENTS[accessor.type];
                const stride = view.byteStride ?? elementBytes;
                const required =
                    (accessor.byteOffset ?? 0) +
                    (accessor.count
                        ? (accessor.count - 1) * stride + elementBytes
                        : 0);
                if (stride < elementBytes || required > view.byteLength) {
                    error(`accessors[${i}] exceeds its bufferView.`);
                }
            }
        }
        if (!natural(accessor.byteOffset ?? 0))
            error(`accessors[${i}] has invalid byteOffset.`);
        if (accessor.sparse)
            warn(`Sparse accessor ${i} is not decoded or fully validated.`);
        for (const key of ["min", "max"]) {
            if (
                accessor[key] !== undefined &&
                (!Array.isArray(accessor[key]) ||
                    accessor[key].length !== TYPE_COMPONENTS[accessor.type] ||
                    !accessor[key].every(
                        (n) => typeof n === "number" && Number.isFinite(n),
                    ))
            ) {
                error(`accessors[${i}].${key} has invalid bounds.`);
            }
        }
        if (
            Array.isArray(accessor.min) &&
            Array.isArray(accessor.max) &&
            accessor.min.length === accessor.max.length &&
            accessor.min.some((n, j) => n > accessor.max[j])
        ) {
            error(`accessors[${i}] has reversed bounds.`);
        }
    });

    let bounds = null;
    let missingBounds = 0;
    meshes.forEach((mesh, i) => {
        if (
            !object(mesh) ||
            !Array.isArray(mesh.primitives) ||
            mesh.primitives.length === 0
        ) {
            error(`meshes[${i}] must have primitives.`);
            return;
        }
        for (const primitive of mesh.primitives) {
            report.summary.primitives++;
            if (!object(primitive) || !object(primitive.attributes)) {
                error(`meshes[${i}] has invalid primitive attributes.`);
                continue;
            }
            for (const [name, ref] of Object.entries(primitive.attributes)) {
                if (!idx(ref, accessors.length))
                    error(
                        "meshes[" +
                            i +
                            "] attribute " +
                            name +
                            " references an invalid accessor.",
                    );
            }
            if (
                primitive.material !== undefined &&
                !idx(primitive.material, materials.length)
            ) {
                error(`meshes[${i}] references an invalid material.`);
            }
            if (primitive.extensions?.KHR_draco_mesh_compression) {
                report.summary.triangleCountComplete = false;
                warn(
                    "Draco-compressed geometry is not decoded; reported triangle counts may be incomplete.",
                );
            }
            const mode = primitive.mode ?? 4;
            if (!natural(mode) || mode > 6)
                error(`meshes[${i}] has unsupported primitive mode.`);
            const position = accessors[primitive.attributes.POSITION];
            if (
                position &&
                (position.type !== "VEC3" || position.componentType !== 5126)
            ) {
                error(`meshes[${i}] POSITION must be VEC3 FLOAT.`);
            }
            let count = position?.count;
            if (primitive.indices !== undefined) {
                if (!idx(primitive.indices, accessors.length)) {
                    error(`meshes[${i}] references invalid indices.`);
                    continue;
                }
                const accessor = accessors[primitive.indices];
                if (
                    accessor?.type !== "SCALAR" ||
                    ![5121, 5123, 5125].includes(accessor.componentType)
                ) {
                    error(`meshes[${i}] indices must be unsigned SCALAR.`);
                    continue;
                }
                count = accessor.count;
            }
            if (mode >= 4 && count === undefined) {
                report.summary.triangleCountComplete = false;
                warn(
                    "meshes[" +
                        i +
                        "] compressed or unsupported geometry cannot be counted.",
                );
            } else if (natural(count)) {
                if (mode === 4 && count % 3 !== 0) {
                    error(
                        `meshes[${i}] TRIANGLES count must be divisible by three.`,
                    );
                }
                report.summary.triangles +=
                    mode === 4
                        ? Math.floor(count / 3)
                        : mode === 5 || mode === 6
                          ? Math.max(0, count - 2)
                          : 0;
            }
            if (position?.min?.length === 3 && position?.max?.length === 3) {
                if (!bounds)
                    bounds = { min: [...position.min], max: [...position.max] };
                else
                    for (let a = 0; a < 3; a++) {
                        bounds.min[a] = Math.min(
                            bounds.min[a],
                            position.min[a],
                        );
                        bounds.max[a] = Math.max(
                            bounds.max[a],
                            position.max[a],
                        );
                    }
            } else {
                missingBounds++;
            }
        }
    });
    if (bounds && missingBounds === 0) {
        report.declaredLocalBounds = {
            ...bounds,
            extents: bounds.max.map((n, i) => n - bounds.min[i]),
            note: "Declared POSITION accessor bounds in mesh-local coordinates; not measured vertices or transformed scene bounds.",
        };
    } else if (report.summary.primitives) {
        warn(
            "Complete local bounds unavailable; some POSITION accessors lack min/max.",
        );
    }
    nodes.forEach((node, i) => {
        if (!object(node)) {
            error(`nodes[${i}] must be an object.`);
            return;
        }
        if (node.mesh !== undefined && !idx(node.mesh, meshes.length))
            error(`nodes[${i}] references invalid mesh.`);
        if (
            node.children !== undefined &&
            (!Array.isArray(node.children) ||
                node.children.some((n) => !idx(n, nodes.length)))
        ) {
            error(`nodes[${i}] references invalid child nodes.`);
        }
    });
    scenes.forEach((scene, i) => {
        if (
            !object(scene) ||
            (scene.nodes !== undefined && !Array.isArray(scene.nodes)) ||
            (scene.nodes ?? []).some((n) => !idx(n, nodes.length))
        ) {
            error(`scenes[${i}] references invalid nodes.`);
        }
    });
    images.forEach((image, i) => {
        if (!object(image)) {
            error(`images[${i}] must be an object.`);
            return;
        }
        if (
            image.bufferView !== undefined &&
            !idx(image.bufferView, bufferViews.length)
        ) {
            error(`images[${i}] references invalid bufferView.`);
        }
        if (typeof image.uri === "string" && !image.uri.startsWith("data:")) {
            report.selfContained = false;
        }
    });
    textures.forEach((texture, i) => {
        if (
            !object(texture) ||
            (texture.source !== undefined &&
                !idx(texture.source, images.length))
        ) {
            error(`textures[${i}] references invalid image.`);
        }
    });
    if (!report.selfContained)
        warn("External resources exist; they were not fetched or validated.");
    if (!Number.isSafeInteger(report.summary.triangles))
        error("Triangle count exceeds safe integer range.");
    return finish();
}
