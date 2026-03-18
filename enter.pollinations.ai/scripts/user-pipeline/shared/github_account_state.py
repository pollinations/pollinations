import re

from d1 import run_d1_query

GITHUB_USERNAME_RE = re.compile(r"^[A-Za-z0-9-]+$")
GITHUB_ACCOUNT_DELETED_REASON = "github_account_deleted"
D1_BATCH_SIZE = 500


def extract_deleted_github_usernames(results: list[dict]) -> list[str]:
    usernames = []
    for result in results:
        username = result.get("username")
        if not isinstance(username, str):
            continue
        if not GITHUB_USERNAME_RE.match(username):
            usernames.append(username)
            continue
        if result.get("status") == GITHUB_ACCOUNT_DELETED_REASON:
            usernames.append(username)
    return usernames


def ban_github_users(usernames: list[str], env: str = "staging") -> int:
    unique_usernames = list(dict.fromkeys(usernames))
    if not unique_usernames:
        return 0

    banned = 0
    for i in range(0, len(unique_usernames), D1_BATCH_SIZE):
        batch = unique_usernames[i : i + D1_BATCH_SIZE]
        username_list = ", ".join(
            "'" + username.replace("'", "''") + "'" for username in batch
        )
        update_query = f"""
            UPDATE user
            SET banned = 1, ban_reason = '{GITHUB_ACCOUNT_DELETED_REASON}'
            WHERE github_username IN ({username_list})
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
