# GitHub Label-Driven Kanban Workflow Plan

This workflow leverages **GitHub labels** to drive automatic issue prioritization and Kanban state transitions.

## Label Categories

Type labels
- bug
- feature
- research
- help

Priority labels
- pri-high
- pri-medium
- pri-low

Status labels
- todo
- in-progress
- review
- done

These labels are used to determine priority and board column.

## Workflow Logic

New issue → classification by type → severity/priority assignment → automatic Kanban state → work execution → review → closure.

## Workflow Diagram

```mermaid
flowchart TD
    A[Issue Created] --> B[Has Type Label?]
    B -->|Yes| C[Assign Priority Label]
    B -->|No| U[Apply Default Labels: type=help pri-low todo]

    C --> D{Priority}
    D -->|pri-high| E[KANBAN: TODO → High Priority]
    D -->|pri-medium| F[KANBAN: TODO → Medium Priority]
    D -->|pri-low| G[KANBAN: TODO → Low Priority]

    E --> H[Assignee Assigned]
    F --> H
    G --> H

    H --> I[Work Started → in-progress Label]
    I --> J[Code/Doc Work]
    J --> K{Ready for Review?}
    K -->|Yes| L[Apply review Label]
    K -->|No| J

    L --> M[Review Completed]
    M --> N[Apply done & close issue]

    subgraph Label-Driven Kanban Columns
        E
        F
        G
    end
