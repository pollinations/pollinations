const assert = require("node:assert/strict");
const test = require("node:test");
const { parseSubmission, findCatalogDuplicate } = require("./submission.js");

function body(name, url, repo = "https://github.com/u/r") {
    return `### App Name
${name}

### App Description
Creates images with the Pollinations image API for collaborative design work.

### App URL
${url}

### GitHub Repository URL
${repo}

### Screenshot
![s](https://raw.githubusercontent.com/u/r/main/s.png)

### App Category
image

### Platform
web

### App Language
en`;
}

// The open-submission check used to pass githubUser.node_id (a base64 GraphQL
// id) while the candidate carried author.id (a number), so the same-name branch
// could never match and a repeated submission slipped through unnoticed.
test("detects a same-name open submission from the same numeric author id", () => {
    const mine = parseSubmission(body("Same Name", "https://a.example.com"));
    const candidate = parseSubmission(
        body("Same Name", "https://b.example.com"),
    );
    const asApp = [
        {
            name: candidate.name,
            url: candidate.appUrl,
            repositoryUrl: candidate.repoUrl,
            githubUserId: 12345,
        },
    ];
    const hit = findCatalogDuplicate(mine, asApp, 12345);
    assert.ok(hit, "same name + same author must be reported as a duplicate");
    assert.equal(hit.url, "https://b.example.com");
});

test("does not trust a GraphQL node id where a numeric id is compared", () => {
    const mine = parseSubmission(
        body("Same Name", "https://a.example.com", "https://github.com/u/a"),
    );
    const candidate = parseSubmission(
        body("Same Name", "https://b.example.com", "https://github.com/u/b"),
    );
    const asApp = [
        {
            name: candidate.name,
            url: candidate.appUrl,
            repositoryUrl: candidate.repoUrl,
            githubUserId: 12345,
        },
    ];
    assert.equal(
        findCatalogDuplicate(mine, asApp, "MDQ6VXNlcjEyMzQ1"),
        undefined,
        "the node_id form must not be used for the numeric comparison",
    );
});

test("still allows the same name from a different author", () => {
    const mine = parseSubmission(
        body("Same Name", "https://a.example.com", "https://github.com/u/a"),
    );
    const candidate = parseSubmission(
        body("Same Name", "https://b.example.com", "https://github.com/u/b"),
    );
    const asApp = [
        {
            name: candidate.name,
            url: candidate.appUrl,
            repositoryUrl: candidate.repoUrl,
            githubUserId: 99999,
        },
    ];
    assert.equal(findCatalogDuplicate(mine, asApp, 12345), undefined);
});

test("still detects duplicates by app URL", () => {
    const mine = parseSubmission(
        body("One", "https://same.example.com", "https://github.com/u/one"),
    );
    const sameUrl = parseSubmission(
        body("Two", "https://same.example.com", "https://github.com/u/two"),
    );
    const hit = findCatalogDuplicate(mine, [
        {
            name: sameUrl.name,
            url: sameUrl.appUrl,
            repositoryUrl: sameUrl.repoUrl,
            githubUserId: 1,
        },
    ]);
    assert.ok(hit, "same app URL must be a duplicate regardless of author");
    assert.equal(hit.name, "Two");
});

test("still detects duplicates by repository URL", () => {
    const mine = parseSubmission(
        body(
            "Three",
            "https://three.example.com",
            "https://github.com/u/shared",
        ),
    );
    const sameRepo = parseSubmission(
        body("Four", "https://four.example.com", "https://github.com/u/shared"),
    );
    const hit = findCatalogDuplicate(mine, [
        {
            name: sameRepo.name,
            url: sameRepo.appUrl,
            repositoryUrl: sameRepo.repoUrl,
            githubUserId: 2,
        },
    ]);
    assert.ok(
        hit,
        "same repository URL must be a duplicate regardless of author",
    );
    assert.equal(hit.name, "Four");
});
