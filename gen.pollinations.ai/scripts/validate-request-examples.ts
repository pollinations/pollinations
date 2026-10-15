import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
    buildCurl,
    type Spec,
    simplifyModelEnums,
} from "./generate-apidocs.ts";

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue =>
    value && typeof value === "object" && !Array.isArray(value)
        ? (value as RecordValue)
        : {};
const pointer = (value: string) =>
    value.replace(/~/g, "~0").replace(/\//g, "~1");

/** Check the emitted curl, against the original (not simplified) schema. */
export function requestExampleErrors(spec: Spec): string[] {
    const renderedSpec = structuredClone(spec);
    simplifyModelEnums(renderedSpec);
    const errors: string[] = [];
    const jsonValidator = addFormats(
        new Ajv({ strict: false, allErrors: true }),
    );
    const wireValidator = addFormats(
        new Ajv({ strict: false, allErrors: true, coerceTypes: true }),
    );
    // A multipart file is represented by curl's @./path placeholder. This
    // checks its presence and schema, not the contents of a file on disk.
    for (const validator of [jsonValidator, wireValidator]) {
        validator.addFormat("binary", true);
    }
    let checked = 0;
    for (const [path, item] of Object.entries(spec.paths)) {
        for (const [method, op] of Object.entries(item)) {
            if (
                !["get", "head", "post", "put", "patch", "delete"].includes(
                    method,
                )
            )
                continue;
            checked++;
            const label = `${method.toUpperCase()} ${path}`;
            try {
                const curl = buildCurl(
                    renderedSpec,
                    method,
                    path,
                    renderedSpec.paths[path][method],
                );
                const lines = curl.split(" \\\n  ");
                const urlMatch = lines
                    .shift()
                    ?.match(/^curl(?: -X \w+)? "([^"]+)"$/);
                if (!urlMatch) throw new Error("unrecognized curl URL");
                const url = new URL(urlMatch[1]);
                for (const value of [
                    ...url.pathname.split("/").map(decodeURIComponent),
                    ...url.searchParams.values(),
                ]) {
                    if (/^:[A-Za-z_][\w-]*$/.test(value))
                        errors.push(
                            `${label}: unresolved URL placeholder ${value}`,
                        );
                }
                const headers = new Headers();
                let body: unknown;
                let contentType: string | undefined;
                const fields: RecordValue = {};
                for (const line of lines) {
                    const header = line.match(/^-H "([^:]+): (.*)"$/);
                    const json = line.match(/^-d '([^']*)'$/);
                    const field = line.match(/^-F "([^=]+)=(.*)"$/);
                    if (header) headers.set(header[1], header[2]);
                    else if (json) {
                        body = JSON.parse(json[1]);
                        contentType = "application/json";
                    } else if (field) {
                        fields[field[1]] = field[2];
                        body = fields;
                        contentType = "multipart/form-data";
                    } else
                        throw new Error(`unrecognized curl argument: ${line}`);
                }

                const opPointer = `#/paths/${pointer(path)}/${method}`;
                const resolve = (value: unknown): RecordValue => {
                    const record = object(value);
                    if (!record.$ref) return record;
                    const ref = String(record.$ref);
                    if (!ref.startsWith("#/"))
                        throw new Error(`unsupported ref: ${ref}`);
                    return object(
                        ref
                            .slice(2)
                            .split("/")
                            .reduce<unknown>(
                                (value, key) =>
                                    object(value)[
                                        key
                                            .replace(/~1/g, "/")
                                            .replace(/~0/g, "~")
                                    ],
                                spec,
                            ),
                    );
                };
                const validate = (
                    ref: string,
                    value: unknown,
                    wire = false,
                ) => {
                    const ajv = wire ? wireValidator : jsonValidator;
                    // Wrapping values allows coercion of wire strings only;
                    // JSON bodies retain their actual types and missing keys.
                    const schema = {
                        components: spec.components,
                        paths: spec.paths,
                        type: "object",
                        properties: { value: { $ref: ref } },
                        required: ["value"],
                    };
                    const check = ajv.compile(schema);
                    if (!check({ value })) {
                        errors.push(
                            `${label} ${ref}: ${ajv.errorsText(check.errors)}`,
                        );
                    }
                };
                const requestBody = resolve(op.requestBody);
                const content = object(requestBody.content);
                if (
                    contentType === "application/json" &&
                    headers.get("content-type") !== contentType
                ) {
                    throw new Error(
                        "JSON body requires Content-Type: application/json",
                    );
                }
                if (body === undefined) {
                    // The published reference rejects any write example
                    // without a body, and most generated schemas leave
                    // `required` unset, so a declared body is enough.
                    if (Object.keys(content).length > 0)
                        errors.push(
                            `${label}: request body example is missing`,
                        );
                } else {
                    if (!contentType || !object(content[contentType]).schema)
                        throw new Error(
                            `emitted ${contentType} body has no matching schema`,
                        );
                    const requestRef =
                        typeof object(op.requestBody).$ref === "string"
                            ? String(object(op.requestBody).$ref)
                            : `${opPointer}/requestBody`;
                    validate(
                        `${requestRef}/content/${pointer(contentType)}/schema`,
                        body,
                        contentType === "multipart/form-data",
                    );
                }

                // Operation parameters override path-item parameters by name/location.
                const parameters = new Map<
                    string,
                    { parameter: RecordValue; ref: string }
                >();
                for (const [owner, prefix] of [
                    [item, `#/paths/${pointer(path)}`],
                    [op, opPointer],
                ] as const) {
                    const params = Array.isArray(owner.parameters)
                        ? owner.parameters
                        : [];
                    params.forEach((raw, index) => {
                        const parameter = resolve(raw);
                        parameters.set(`${parameter.in}:${parameter.name}`, {
                            parameter,
                            ref:
                                typeof object(raw).$ref === "string"
                                    ? String(object(raw).$ref)
                                    : `${prefix}/parameters/${index}`,
                        });
                    });
                }
                const templateParts = path.split("/").slice(1);
                const actualParts = url.pathname
                    .split("/")
                    .slice(-templateParts.length);
                for (const { parameter, ref } of parameters.values()) {
                    const name = String(parameter.name);
                    let value: string | null | undefined;
                    if (parameter.in === "query")
                        value = url.searchParams.get(name);
                    else if (parameter.in === "header")
                        value = headers.get(name);
                    else if (parameter.in === "path") {
                        const index = templateParts.indexOf(`{${name}}`);
                        value =
                            index < 0
                                ? undefined
                                : decodeURIComponent(actualParts[index]);
                    } else
                        throw new Error(
                            `unsupported parameter location: ${parameter.in}`,
                        );
                    if (value == null) {
                        if (parameter.required === true)
                            errors.push(
                                `${label}: required ${parameter.in} parameter ${name} is missing`,
                            );
                    } else {
                        if (!parameter.schema)
                            throw new Error(`parameter ${name} has no schema`);
                        validate(`${ref}/schema`, value, true);
                    }
                }
            } catch (error) {
                errors.push(
                    `${label}: ${error instanceof Error ? error.message : error}`,
                );
            }
        }
    }
    if (!checked) errors.push("No request operations were checked");
    return errors;
}
