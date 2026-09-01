export type JsonObject = Record<string, unknown>;

export type DirectResponsesTarget = {
    authConfigured: boolean;
    endpoint: string;
    headers: Record<string, string>;
    model: string;
    defaults: JsonObject;
};
