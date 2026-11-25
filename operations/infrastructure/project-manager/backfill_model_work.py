"""Fill only empty Model work cells on the Dev project's open Models backlog."""

import json

from project_manager import DEV_PROJECT_ID, DRY_RUN, MODEL_WORK, ask_ai, dev_fields, graphql_request, read_brief, set_field

QUERY = """
query($project: ID!, $after: String) {
  node(id: $project) { ... on ProjectV2 {
    items(first: 50, after: $after, query: "is:open area:Models no:model-work repo:pollinations/pollinations") {
      pageInfo { hasNextPage endCursor }
      nodes { id content {
        __typename
        ... on Issue { number title body }
        ... on PullRequest { number title body files(first: 20) { nodes { path } } }
      } }
    }
  } }
}
"""


def main():
    brief = read_brief()
    field = dev_fields([])["Model work"]
    items = []
    after = None
    while True:
        page = graphql_request(QUERY, {"project": DEV_PROJECT_ID, "after": after})["node"]["items"]
        items.extend(page["nodes"])
        if not page["pageInfo"]["hasNextPage"]:
            break
        after = page["pageInfo"]["endCursor"]
    instructions = brief + """
For this backlog pass, return a JSON object mapping each supplied issue or PR number
to its Model work option, or null when outside the four queues. Return every number."""
    counts = dict.fromkeys([*MODEL_WORK, "Unassigned"], 0)
    for start in range(0, len(items), 8):
        batch = items[start:start + 8]
        facts = [{**item["content"], "body": (item["content"]["body"] or "")[:2000]} for item in batch]
        answer = ask_ai(instructions, json.dumps(facts))
        numbers = [str(item["number"]) for item in facts]
        if (answer is None or set(answer) != set(numbers)
                or any(value is not None and value not in MODEL_WORK for value in answer.values())):
            raise ValueError(f"Invalid model queues for {numbers}")
        # Classification takes time. Check the item is still eligible immediately before writing.
        current = graphql_request("""
          query($ids: [ID!]!) { nodes(ids: $ids) { ... on ProjectV2Item {
            id isArchived
            area: fieldValueByName(name: "Area") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
            queue: fieldValueByName(name: "Model work") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
            content { ... on Issue { closed } ... on PullRequest { closed } }
          } } }
        """, {"ids": [item["id"] for item in batch]})["nodes"]
        eligible = {i["id"] for i in current if i and not i["isArchived"] and not i["queue"]
                    and (i["area"] or {}).get("name") == "Models" and i["content"] and not i["content"]["closed"]}
        for item, number in zip(batch, numbers):
            if item["id"] not in eligible:
                continue
            value = answer[number]
            counts[value or "Unassigned"] += 1
            print(f"#{number} {value} {item['content']['title']}")
            if value:
                set_field(item["id"], field, value)
    print(f"{'Preview' if DRY_RUN else 'Applied'}: {counts}")


if __name__ == "__main__":
    main()
