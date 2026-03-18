import re

from d1 import run_d1_query

GITHUB_USERNAME_RE = re.compile(r"^[A-Za-z0-9-]+$")
GITHUB_ACCOUNT_DELETED_REASON = "github_account_deleted"
D1_BATCH_SIZE = 500


def extract_deleted_github_ids(results: list[dict]) -> list[int]:
    github_ids: list[int] = []
    for result in results:
        github_id = result.get("github_id")
        if isinstance(github_id, bool):
            continue
        if isinstance(github_id, int) and github_id > 0:
            if result.get("status") == GITHUB_ACCOUNT_DELETED_REASON:
                github_ids.append(github_id)
    return github_ids


def ban_github_ids(github_ids: list[int], env: str = "staging") -> int:
    unique_github_ids = list(
        dict.fromkeys(
            github_id
            for github_id in github_ids
            if isinstance(github_id, int) and not isinstance(github_id, bool) and github_id > 0
        )
    )
    if not unique_github_ids:
        return 0

    banned = 0
    for i in range(0, len(unique_github_ids), D1_BATCH_SIZE):
        batch = unique_github_ids[i : i + D1_BATCH_SIZE]
        id_list = ", ".join(str(github_id) for github_id in batch)
        update_query = f"""
            UPDATE user
            SET banned = 1, ban_reason = '{GITHUB_ACCOUNT_DELETED_REASON}'
            WHERE github_id IN ({id_list})
        """
        result = run_d1_query(update_query, env)
        if result is not None:
            banned += len(batch)

    return banned
def ban_users_by_emails(emails: list[str], env: str = "staging") -> int:
    unique_emails = [
        email for email in dict.fromkeys(emails) if isinstance(email, str) and email
    ]
    if not unique_emails:
        return 0

    banned = 0
    for i in range(0, len(unique_emails), D1_BATCH_SIZE):
        batch = unique_emails[i : i + D1_BATCH_SIZE]
        email_list = ", ".join("'" + email.replace("'", "''") + "'" for email in batch)
        update_query = f"""
            UPDATE user
            SET banned = 1, ban_reason = '{GITHUB_ACCOUNT_DELETED_REASON}'
            WHERE email IN ({email_list})
        """
        result = run_d1_query(update_query, env)
        if result is not None:
            banned += len(batch)

    return banned
