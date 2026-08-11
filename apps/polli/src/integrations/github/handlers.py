"""Tool handlers for GitHub — the functions the AI actually calls.

Thin dispatch layer over the REST client (`client.py`) and GraphQL client (`graphql.py`).
"""

import logging

from ..subscriptions import subscription_manager
from .client import github_manager
from .graphql import github_graphql
from .pull_requests import tool_github_pr

logger = logging.getLogger(__name__)

async def tool_github_issue(
    action: str,
    issue_number: int = None,
    keywords: str = None,
    state: str = "open",
    title: str = None,
    description: str = None,
    body: str = None,
    comment: str = None,
    comment_id: int = None,  # For edit_comment/delete_comment actions
    reason: str = "completed",
    labels: list[str] = None,
    assignees: list[str] = None,
    milestone: str = None,
    lock: bool = None,
    related_issues: list[int] = None,
    relationship: str = None,
    discord_username: str = None,
    include_comments: bool = False,
    limit: int = 10,
    child_issue_number: int = None,  # For sub-issue actions
    edit_index: int = None,  # For get_history - get full diff for specific edit (0=most recent)
    # Injected by bot.py for subscriptions (legacy params kept for compatibility)
    user_id: int = 0,
    channel_id: int = 0,
    guild_id: int = None,
    reporter: str = "Discord User",
    user_role_ids: list[int] = None,
    # New: context dict injected by pollinations client
    _context: dict = None,
    **kwargs,  # Catch any extra args
) -> dict:
    """
    Consolidated issue tool - handles ALL issue operations based on action.
    """
    # Extract context if provided (new approach - avoids re-registering handlers per message)
    is_admin = False
    is_collaborator = False
    context_user_id = None
    context_user_name = None
    if _context:
        is_admin = _context.get("is_admin", False)
        is_collaborator = _context.get("is_collaborator", False)
        context_user_id = _context.get("user_id")
        context_user_name = _context.get("user_name")
        user_id = _context.get("user_id", user_id)
        channel_id = _context.get("channel_id", channel_id)
        guild_id = _context.get("guild_id", guild_id)
        reporter = _context.get("reporter", reporter)
        user_role_ids = _context.get("user_role_ids", user_role_ids)

    action = action.lower()

    # COLLABORATOR ACTIONS - allowed for users with collaborator role (matches git collaborator perms)
    # close, reopen, label, unlabel, assign, unassign — same as GitHub collaborator access
    COLLABORATOR_ACTIONS = {
        "close",
        "reopen",
        "label",
        "unlabel",
        "assign",
        "unassign",
    }

    # ADMIN-ONLY ACTIONS - require full admin permission
    ADMIN_ACTIONS = {
        "edit",
        "milestone",
        "lock",
        "link",
        "create_sub_issue",
        "add_sub_issue",
        "remove_sub_issue",
    }

    # All privileged actions (both collaborator + admin-only)
    ALL_PRIVILEGED_ACTIONS = COLLABORATOR_ACTIONS | ADMIN_ACTIONS

    # Exception: Issue #6418 (Seed Upgrade Tracking) can be edited by anyone
    SEED_TRACKING_ISSUE = 6418
    is_seed_tracking_edit = action == "edit" and issue_number == SEED_TRACKING_ISSUE

    if action in ALL_PRIVILEGED_ACTIONS and not is_seed_tracking_edit:
        if action in COLLABORATOR_ACTIONS and (is_admin or is_collaborator):
            logger.info(f"Collaborator action '{action}' authorized for {context_user_name} (id={context_user_id})")
        elif action in ADMIN_ACTIONS and is_admin:
            logger.info(f"Admin action '{action}' authorized for {context_user_name} (id={context_user_id})")
        else:
            # SECURITY: Log blocked action attempt
            level = "admin" if action in ADMIN_ACTIONS else "collaborator"
            logger.warning(
                f"SECURITY: Blocked {level} action '{action}' for user {context_user_name} (id={context_user_id})"
            )
            return {"error": f"The '{action}' action requires {level} permissions. Ask a team member with access!"}

    # READ ACTIONS
    if action == "get":
        if not issue_number:
            return {"error": "issue_number required for 'get' action"}
        issue = await github_graphql.get_issue_full(
            issue_number=issue_number, comments_count=5 if include_comments else 0
        )
        if not issue:
            return {
                "error": f"Issue #{issue_number} not found",
                "not_found": True,
                "hint": "The issue doesn't exist. Ask the user if they meant a different number.",
            }
        result = {"issue": issue}
        if include_comments and "comments" in issue:
            result["comments"] = issue.pop("comments")
        return result

    elif action == "get_history":
        if not issue_number:
            return {"error": "issue_number required for 'get_history' action"}
        history = await github_graphql.get_edit_history(
            number=issue_number, is_pr=False, limit=limit or 10, edit_index=edit_index
        )
        return history

    elif action == "search":
        if not keywords:
            return {"error": "keywords required for 'search' action"}
        issues = await github_graphql.search_issues_full(keywords=keywords, state=state, limit=limit)
        return {
            "issues": issues,
            "count": len(issues),
            "query": keywords,
            "state": state,
        }

    elif action == "search_user":
        if not discord_username:
            return {"error": "discord_username required for 'search_user' action"}
        issues = await github_graphql.search_user_issues(discord_username=discord_username, state=state, limit=limit)
        return {
            "issues": issues,
            "count": len(issues),
            "discord_username": discord_username,
        }

    elif action == "find_similar":
        if not keywords:
            return {"error": "keywords required for 'find_similar' action"}
        issues = await github_graphql.find_similar_issues(keywords=keywords, limit=limit or 5)
        return {
            "similar_issues": issues,
            "count": len(issues),
            "keywords": keywords,
            "hint": "If any match, suggest adding a comment instead of creating a duplicate.",
        }

    elif action == "list_labels":
        labels_list = await github_manager.list_labels()
        return {"labels": labels_list, "count": len(labels_list)}

    elif action == "list_milestones":
        milestones = await github_manager.list_milestones(state=state)
        return {"milestones": milestones, "count": len(milestones), "state": state}

    # WRITE ACTIONS
    elif action == "create":
        if not title or not description:
            return {"error": "title and description required for 'create' action"}
        return await github_manager.create_issue(
            title=title,
            description=description,
            reporter=reporter,
            user_role_ids=user_role_ids,
            reporter_id=user_id,  # Discord UID from context
            message_url=(_context.get("message_url") if _context else None),  # Link back to Discord
        )

    elif action == "comment":
        if not issue_number or not comment:
            return {"error": "issue_number and comment required for 'comment' action"}
        return await github_manager.add_comment(issue_number=issue_number, comment=comment, author=reporter)

    elif action == "edit_comment":
        if not comment_id or not body:
            return {"error": "comment_id and body required for 'edit_comment' action"}
        return await github_manager.edit_comment(
            comment_id=comment_id,
            new_body=body,
            requester=reporter,  # Only allow editing comments they originally requested
        )

    elif action == "delete_comment":
        if not comment_id:
            return {"error": "comment_id required for 'delete_comment' action"}
        return await github_manager.delete_comment(
            comment_id=comment_id,
            requester=reporter,  # Only allow deleting comments they originally requested
        )

    # ADMIN ACTIONS
    elif action == "close":
        if not issue_number:
            return {"error": "issue_number required for 'close' action"}
        return await github_manager.close_issue(issue_number=issue_number, reason=reason, comment=comment)

    elif action == "reopen":
        if not issue_number:
            return {"error": "issue_number required for 'reopen' action"}
        return await github_manager.reopen_issue(issue_number=issue_number, comment=comment)

    elif action == "edit":
        if not issue_number:
            return {"error": "issue_number required for 'edit' action"}
        return await github_manager.edit_issue(issue_number=issue_number, title=title, body=body)

    elif action == "label":
        if not issue_number or not labels:
            return {"error": "issue_number and labels required for 'label' action"}
        return await github_manager.add_labels(issue_number=issue_number, labels=labels)

    elif action == "unlabel":
        if not issue_number or not labels:
            return {"error": "issue_number and labels required for 'unlabel' action"}
        return await github_manager.remove_labels(issue_number=issue_number, labels=labels)

    elif action == "assign":
        if not issue_number or not assignees:
            return {"error": "issue_number and assignees required for 'assign' action"}
        return await github_manager.assign_issue(issue_number=issue_number, assignees=assignees)

    elif action == "unassign":
        if not issue_number or not assignees:
            return {"error": "issue_number and assignees required for 'unassign' action"}
        return await github_manager.unassign_issue(issue_number=issue_number, assignees=assignees)

    elif action == "milestone":
        if not issue_number or not milestone:
            return {"error": "issue_number and milestone required for 'milestone' action"}
        return await github_manager.set_milestone(issue_number=issue_number, milestone=milestone)

    elif action == "lock":
        if not issue_number or lock is None:
            return {"error": "issue_number and lock (true/false) required for 'lock' action"}
        return await github_manager.lock_issue(issue_number=issue_number, lock=lock, reason=reason if lock else None)

    elif action == "link":
        if not issue_number or not related_issues or not relationship:
            return {"error": "issue_number, related_issues, and relationship required for 'link' action"}
        return await github_manager.link_issues(
            issue_number=issue_number,
            related_issues=related_issues,
            relationship=relationship,
        )

    # SUBSCRIPTION ACTIONS (async SQLite)
    elif action == "subscribe":
        if not issue_number:
            return {"error": "issue_number required for 'subscribe' action"}
        from ..subscriptions import subscription_manager

        issue = await github_graphql.get_issue_full(issue_number)
        if not issue:
            return {"success": False, "error": f"Issue #{issue_number} not found"}
        if await subscription_manager.is_subscribed(user_id, issue_number):
            return {
                "success": False,
                "already_subscribed": True,
                "message": f"Already subscribed to #{issue_number}",
            }
        success = await subscription_manager.subscribe(
            user_id=user_id,
            issue_number=issue_number,
            channel_id=channel_id,
            guild_id=guild_id,
            initial_state=issue,
        )
        if success:
            return {
                "success": True,
                "issue_number": issue_number,
                "message": f"Subscribed to #{issue_number}!",
            }
        return {"success": False, "error": "Failed to subscribe"}

    elif action == "unsubscribe":
        if not issue_number:
            return {"error": "issue_number required for 'unsubscribe' action"}
        from ..subscriptions import subscription_manager

        was_subscribed = await subscription_manager.unsubscribe(user_id, issue_number)
        if was_subscribed:
            return {"success": True, "message": f"Unsubscribed from #{issue_number}"}
        return {"success": False, "message": f"Wasn't subscribed to #{issue_number}"}

    elif action == "unsubscribe_all":
        from ..subscriptions import subscription_manager

        count = await subscription_manager.unsubscribe_all(user_id)
        return {
            "success": True,
            "unsubscribed_count": count,
            "message": f"Unsubscribed from {count} issues",
        }

    elif action == "list_subscriptions":
        from ..subscriptions import subscription_manager

        subs = await subscription_manager.get_user_subscriptions(user_id)
        return {
            "subscriptions": [{"issue_number": s["issue_number"], "state": s["last_state"]} for s in subs],
            "count": len(subs),
        }

    # SUB-ISSUE ACTIONS
    elif action == "get_sub_issues":
        if not issue_number:
            return {"error": "issue_number required for 'get_sub_issues' action"}
        # get_issue_full already includes sub_issues, so just call it
        issue = await github_graphql.get_issue_full(issue_number=issue_number, comments_count=0)
        if not issue or issue.get("error"):
            return issue or {"error": f"Issue #{issue_number} not found"}
        sub_issues = issue.get("sub_issues", [])
        return {
            "parent_issue": {"number": issue["number"], "title": issue["title"]},
            "sub_issues": sub_issues,
            "count": len(sub_issues),
            "hint": (
                "Each sub-issue can be fetched with action='get'" if sub_issues else "This issue has no sub-issues"
            ),
        }

    elif action == "get_parent":
        if not issue_number:
            return {"error": "issue_number required for 'get_parent' action"}
        issue = await github_graphql.get_issue_full(issue_number=issue_number, comments_count=0)
        if not issue or issue.get("error"):
            return issue or {"error": f"Issue #{issue_number} not found"}
        parent = issue.get("parent_issue")
        if parent:
            return {
                "issue": {"number": issue["number"], "title": issue["title"]},
                "parent_issue": parent,
            }
        return {
            "issue": {"number": issue["number"], "title": issue["title"]},
            "parent_issue": None,
            "message": f"Issue #{issue_number} is not a sub-issue (has no parent)",
        }

    # ADMIN SUB-ISSUE ACTIONS
    elif action == "create_sub_issue":
        # Create a new issue and immediately link it as a sub-issue of the parent
        if not issue_number or not title or not description:
            return {"error": "issue_number (parent), title, and description required for 'create_sub_issue' action"}
        # Step 1: Create the new issue
        create_result = await github_manager.create_issue(
            title=title,
            description=description,
            reporter=reporter,
            user_role_ids=user_role_ids,
            reporter_id=user_id,
            message_url=_context.get("message_url") if _context else None,
        )
        if not create_result.get("success"):
            return create_result
        # Step 2: Link it as a sub-issue of the parent
        child_number = create_result["issue_number"]
        link_result = await github_graphql.add_sub_issue(
            parent_issue_number=issue_number, child_issue_number=child_number
        )
        if link_result.get("error"):
            # Issue created but linking failed - still return useful info
            return {
                "success": True,
                "partial": True,
                "issue_number": child_number,
                "issue_url": create_result["issue_url"],
                "parent_issue": issue_number,
                "link_error": link_result.get("error"),
                "message": f"Issue #{child_number} created but failed to link as sub-issue of #{issue_number}",
            }
        return {
            "success": True,
            "issue_number": child_number,
            "issue_url": create_result["issue_url"],
            "parent_issue": issue_number,
            "message": f"Created #{child_number} as sub-issue of #{issue_number}",
        }

    elif action == "add_sub_issue":
        if not issue_number or not child_issue_number:
            return {"error": "issue_number (parent) and child_issue_number required for 'add_sub_issue' action"}
        return await github_graphql.add_sub_issue(
            parent_issue_number=issue_number, child_issue_number=child_issue_number
        )

    elif action == "remove_sub_issue":
        if not issue_number or not child_issue_number:
            return {"error": "issue_number (parent) and child_issue_number required for 'remove_sub_issue' action"}
        return await github_graphql.remove_sub_issue(
            parent_issue_number=issue_number, child_issue_number=child_issue_number
        )

    else:
        return {
            "error": f"Unknown action: {action}. Valid: get, search, create, close, comment, edit_comment, delete_comment, edit, label, assign, subscribe, get_sub_issues, get_parent, etc."
        }


async def tool_github_project(
    action: str,
    project_number: int = None,
    issue_number: int = None,
    status: str = None,
    field_name: str = None,
    field_value: str = None,
    limit: int = 50,
    _context: dict = None,
    **kwargs,
) -> dict:
    """
    Consolidated project tool - handles ALL GitHub Projects V2 operations.
    """
    # Extract admin status from context
    is_admin = False
    context_user_id = None
    context_user_name = None
    if _context:
        is_admin = _context.get("is_admin", False)
        context_user_id = _context.get("user_id")
        context_user_name = _context.get("user_name")

    action = action.lower()

    # ADMIN ACTIONS - require admin permission
    ADMIN_ACTIONS = {"add", "remove", "set_status", "set_field"}
    if action in ADMIN_ACTIONS:
        if not is_admin:
            # SECURITY: Log blocked admin action attempt
            logger.warning(
                f"SECURITY: Blocked project admin action '{action}' for non-admin user {context_user_name} (id={context_user_id})"
            )
            return {"error": f"The '{action}' action requires admin permissions. Ask a team member with admin access!"}
        else:
            logger.info(f"Project admin action '{action}' authorized for {context_user_name} (id={context_user_id})")

    # LIST ALL PROJECTS (no project_number required)
    if action == "list":
        return await github_graphql.list_projects(limit=limit)

    # All other actions require project_number
    if not project_number:
        return {"error": f"project_number required for '{action}' action. Use action='list' to see all projects."}

    # READ ACTIONS
    if action == "view":
        result = await github_graphql.get_project_view(project_number)
        if result.get("error"):
            return {
                "error": result["error"],
                "not_found": True,
                "hint": "Project doesn't exist. Use action='list' to see available projects.",
            }
        return result

    elif action == "list_items":
        result = await github_graphql.list_project_items(project_number=project_number, status=status, limit=limit)
        if result.get("error"):
            return {
                "error": result["error"],
                "not_found": True,
                "hint": "Project doesn't exist or you don't have access. Don't try other tools - just tell the user.",
            }
        return result

    elif action == "get_item":
        if not issue_number:
            return {"error": "issue_number required for 'get_item' action"}
        return await github_graphql.get_project_item(project_number=project_number, issue_number=issue_number)

    # WRITE ACTIONS (admin only)
    elif action == "add":
        if not issue_number:
            return {"error": "issue_number (or PR number) required for 'add' action"}
        # Use the new add_to_project that works for both issues AND PRs
        return await github_graphql.add_to_project(number=issue_number, project_number=project_number)

    elif action == "remove":
        if not issue_number:
            return {"error": "issue_number required for 'remove' action"}
        return await github_graphql.remove_from_project(project_number=project_number, issue_number=issue_number)

    elif action == "set_status":
        if not issue_number or not status:
            return {"error": "issue_number and status required for 'set_status' action"}
        return await github_graphql.set_project_item_status(
            project_number=project_number, issue_number=issue_number, status=status
        )

    elif action == "set_field":
        if not issue_number or not field_name or not field_value:
            return {"error": "issue_number, field_name, and field_value required for 'set_field' action"}
        return await github_graphql.set_project_item_field(
            project_number=project_number,
            issue_number=issue_number,
            field_name=field_name,
            field_value=field_value,
        )

    else:
        return {
            "error": f"Unknown action: {action}. Valid: list, view, list_items, get_item, add, remove, set_status, set_field"
        }


async def tool_github_custom(
    request: str = None,
    graphql_query: str = None,
    rest_endpoint: str = None,
    rest_url: str = None,
    include_body: bool = False,
    limit: int = 50,
    _context: dict = None,
    **kwargs,
) -> dict:
    """
    Fully dynamic GitHub data fetching - AI has FULL read-only control!

    4 modes:
    1. graphql_query: Raw GraphQL query - AI writes the query directly
    2. rest_endpoint: REST API path relative to repo (e.g., 'actions/runs')
    3. rest_url: Full GitHub API URL (e.g., 'https://api.github.com/users/octocat')
    4. request: Natural language fallback (keyword matching)
    """
    return await github_graphql.execute_custom_request(
        request=request or "",
        include_body=include_body,
        limit=limit,
        graphql_query=graphql_query,
        rest_endpoint=rest_endpoint,
        rest_url=rest_url,
    )


async def tool_github_overview(
    issues_limit: int = 10,
    include_projects: bool = True,
    _context: dict = None,
    **kwargs,
) -> dict:
    """
    Combined overview query - gets issues, labels, milestones, projects in ONE call.
    Much faster than making separate calls!
    """
    return await github_graphql.get_repo_overview(issues_limit=min(issues_limit, 50), include_projects=include_projects)

# =============================================================================
# SUBSCRIPTION TOOL HANDLERS
# =============================================================================


async def tool_subscribe_issue(
    issue_number: int,
    user_id: int,
    channel_id: int,
    guild_id: int = None,
) -> dict:
    """Subscribe a user to issue notifications."""
    # Verify issue exists first - reject subscription to non-existent issues
    issue = await github_graphql.get_issue_full(issue_number)
    if not issue or "error" in issue:
        return {
            "success": False,
            "message": f"Issue #{issue_number} does not exist.",
        }

    initial_state = {
        "state": issue.get("state", "open"),
        "comments_count": issue.get("comments_count", 0),
        "labels": issue.get("labels", []),
    }

    success = await subscription_manager.subscribe(
        user_id=user_id,
        issue_number=issue_number,
        channel_id=channel_id,
        guild_id=guild_id,
        initial_state=initial_state,
    )

    if success:
        return {
            "success": True,
            "message": f"✅ Subscribed to **#{issue_number}**: {issue.get('title', 'Unknown')}\n\nYou'll get DM notifications when there are updates!",
        }
    return {
        "success": False,
        "message": f"❌ Failed to subscribe to #{issue_number}. Please try again.",
    }


async def tool_unsubscribe_issue(
    issue_number: int,
    user_id: int,
) -> dict:
    """Unsubscribe a user from issue notifications."""
    was_subscribed = await subscription_manager.unsubscribe(
        user_id=user_id,
        issue_number=issue_number,
    )

    if was_subscribed:
        return {
            "success": True,
            "message": f"✅ Unsubscribed from **#{issue_number}**",
        }
    return {
        "success": False,
        "message": f"You weren't subscribed to #{issue_number}",
    }


async def tool_unsubscribe_all(user_id: int) -> dict:
    """Unsubscribe a user from all issue notifications."""
    count = await subscription_manager.unsubscribe_all(user_id=user_id)

    if count > 0:
        return {
            "success": True,
            "message": f"✅ Unsubscribed from **{count}** issue(s)",
        }
    return {
        "success": True,
        "message": "You didn't have any active subscriptions",
    }


async def tool_list_subscriptions(user_id: int) -> dict:
    """List all subscriptions for a user."""
    subs = await subscription_manager.get_user_subscriptions(user_id=user_id)

    if not subs:
        return {
            "success": True,
            "message": "📭 You don't have any active subscriptions.\n\nUse `subscribe #123` to subscribe to an issue!",
        }

    lines = ["📬 **Your Subscriptions:**\n"]
    for sub in subs:
        issue_num = sub["issue_number"]
        state = sub.get("last_state", "open")
        emoji = "🟢" if state == "open" else "🔴"
        lines.append(f"{emoji} **#{issue_num}** ({state})")

    lines.append(f"\n*{len(subs)} subscription(s) total*")
    return {
        "success": True,
        "message": "\n".join(lines),
    }


# Export consolidated tool handlers
TOOL_HANDLERS = {
    "github_issue": tool_github_issue,
    "github_project": tool_github_project,
    "github_custom": tool_github_custom,
    "github_overview": tool_github_overview,
    "github_pr": tool_github_pr,
    # Subscription handlers
    "subscribe_issue": tool_subscribe_issue,
    "unsubscribe_issue": tool_unsubscribe_issue,
    "unsubscribe_all": tool_unsubscribe_all,
    "list_subscriptions": tool_list_subscriptions,
}
