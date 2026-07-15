import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import {
    createTestR2Bucket,
    type TestR2Bucket,
} from "@shared/test/mocks/r2.ts";
import { expect } from "vitest";
import worker from "../src/index.ts";

async function request(
    bucket: TestR2Bucket,
    path: string,
    init: RequestInit = {},
) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        { ...env, APP_BUCKET: bucket },
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

function deploymentBody(html: string) {
    return JSON.stringify({
        name: "My App",
        files: [
            { path: "index.html", content: html },
            {
                path: "assets/app.js",
                content: "document.documentElement.dataset.ready = 'yes';",
            },
        ],
    });
}

test("requires the deploy permission", async ({ apiKey }) => {
    const response = await request(createTestR2Bucket(), "/v1/deployments", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: deploymentBody("<h1>Denied</h1>"),
    });

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toContain("deploy permission");
});

test("publishes and updates a static frontend", async () => {
    const bucket = createTestR2Bucket();
    const { key } = await createTestApiKey({
        accountPermissions: ["deploy"],
    });
    const createResponse = await request(bucket, "/v1/deployments", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body: deploymentBody("<h1>Version one</h1>"),
    });

    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
        id: string;
        slug: string;
        version: string;
        url: string;
    };
    expect(created.slug).toMatch(/^my-app-[a-f0-9]{8}$/);
    expect(created.url).toBe(
        `https://gen.pollinations.ai/apps/${created.slug}/`,
    );

    const pageResponse = await request(bucket, `/apps/${created.slug}`);
    expect(pageResponse.status).toBe(200);
    expect(pageResponse.headers.get("Content-Type")).toContain("text/html");
    expect(pageResponse.headers.get("Cache-Control")).toBe("no-cache");
    await expect(pageResponse.text()).resolves.toBe("<h1>Version one</h1>");

    const assetResponse = await request(
        bucket,
        `/apps/${created.slug}/assets/app.js`,
    );
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get("Content-Type")).toContain(
        "text/javascript",
    );

    const spaResponse = await request(
        bucket,
        `/apps/${created.slug}/settings`,
        {
            headers: { Accept: "text/html" },
        },
    );
    expect(spaResponse.status).toBe(200);
    await expect(spaResponse.text()).resolves.toContain("Version one");

    const hostContext = createExecutionContext();
    const hostResponse = await worker.fetch(
        new Request(
            `https://${created.slug}.${env.APP_DEPLOY_HOST as string}/`,
        ),
        { ...env, APP_BUCKET: bucket },
        hostContext,
    );
    await waitOnExecutionContext(hostContext);
    expect(hostResponse.status).toBe(200);
    await expect(hostResponse.text()).resolves.toContain("Version one");

    const updateResponse = await request(
        bucket,
        `/v1/deployments/${created.id}`,
        {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: deploymentBody("<h1>Version two</h1>"),
        },
    );
    expect(updateResponse.status).toBe(200);
    const updated = (await updateResponse.json()) as { version: string };
    expect(updated.version).not.toBe(created.version);
    expect(
        bucket.getObject(
            `deployments/${created.id}/${created.version}/index.html`,
        ),
    ).toBeUndefined();

    const updatedPageResponse = await request(bucket, `/apps/${created.slug}`);
    await expect(updatedPageResponse.text()).resolves.toContain("Version two");

    const listResponse = await request(bucket, "/v1/deployments", {
        headers: { Authorization: `Bearer ${key}` },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual(
        expect.arrayContaining([
            expect.objectContaining({ id: created.id, slug: created.slug }),
        ]),
    );

    const deleteResponse = await request(
        bucket,
        `/v1/deployments/${created.id}`,
        {
            method: "DELETE",
            headers: { Authorization: `Bearer ${key}` },
        },
    );
    expect(deleteResponse.status).toBe(204);
    expect(
        bucket.getObject(
            `deployments/${created.id}/${updated.version}/index.html`,
        ),
    ).toBeUndefined();

    const deletedPageResponse = await request(bucket, `/apps/${created.slug}`);
    expect(deletedPageResponse.status).toBe(404);
});

test("rejects unsafe or incomplete asset sets", async () => {
    const bucket = createTestR2Bucket();
    const { key } = await createTestApiKey({
        accountPermissions: ["deploy"],
    });
    const headers = {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
    };

    const missingIndex = await request(bucket, "/v1/deployments", {
        method: "POST",
        headers,
        body: JSON.stringify({
            name: "No Index",
            files: [{ path: "app.js", content: "" }],
        }),
    });
    expect(missingIndex.status).toBe(400);

    const traversal = await request(bucket, "/v1/deployments", {
        method: "POST",
        headers,
        body: JSON.stringify({
            name: "Traversal",
            files: [
                { path: "index.html", content: "ok" },
                { path: "../secret", content: "no" },
            ],
        }),
    });
    expect(traversal.status).toBe(400);
});
