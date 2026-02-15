# Maintenance

## CI & Testing

-   **backend-run-tests.yml** - Runs backend tests for `text` and `image` services when files change.

## Branch Cleanup

-   **branch-delete-stale.yml** - Manual workflow to delete branches older than X days. Protected branches (main, master, production) always excluded.
-   **branch-delete-merged.yml** - Auto-deletes the source branch when a PR is merged. Skips forks and protected branches.

## Flow Diagram

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart TD
    subgraph AUTO["On PR Merge"]
        A[PR merged] --> B[branch-delete-merged.yml]
        B --> C{Protected?}
        C -->|No| D[Delete source branch]
        C -->|Yes| E[Skip]
    end

    subgraph MANUAL["Manual Trigger"]
        F[Run branch-delete-stale.yml] --> G[Input: X days]
        G --> H[GraphQL: fetch all branches]
        H --> I{Older than X days?}
        I -->|Yes & not protected| J[Delete branch]
        I -->|No or protected| K[Keep branch]
    end
```
