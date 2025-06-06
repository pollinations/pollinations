#!/bin/bash
# Common SQL queries for the auth.pollinations.ai database
# Usage: ./common-sql-queries.sh [query-name]

DB_NAME="github_auth"

# Function to execute a query
execute_query() {
    local query="$1"
    echo " Executing: $query"
    echo "---"
    wrangler d1 execute --remote --command "$query" $DB_NAME
    echo ""
}

# Function to show usage
show_usage() {
    echo " Common SQL Queries for Auth Database"
    echo "Usage: $0 [query-name]"
    echo ""
    echo "Available queries:"
    echo "  top-ad-clickers       - Top 10 users by ad clicks"
    echo "  all-ad-clickers       - All users with ad clicks"
    echo "  user-metrics <id>     - Get metrics for specific user ID"
    echo "  user-domains <id>     - Get all registered domains for user ID"
    echo "  user-profile <id>     - Get complete user profile (info, tier, domains, metrics)"
    echo "  add-domain <user_id> <domain> - Add domain to user's allowlist"
    echo "  remove-domain <id>    - Remove domain by domain ID"
    echo "  all-domains          - List all registered domains with users"
    echo "  user-count           - Total user count"
    echo "  recent-users         - Users created in last 7 days"
    echo "  table-info           - Show all tables"
    echo "  users-schema         - Show users table schema"
    echo "  top-metrics          - Top users by various metrics"
    echo ""
    echo "Examples:"
    echo "  $0 top-ad-clickers"
    echo "  $0 user-metrics 5099901"
    echo "  $0 user-domains 5099901"
    echo "  $0 user-profile 5099901"
    echo "  $0 add-domain 5099901 example.com"
    echo "  $0 remove-domain 123"
}

case "$1" in
    "top-ad-clickers")
        execute_query "SELECT github_user_id, username, json_extract(metrics, '$.ad_clicks') as ad_clicks FROM users WHERE json_extract(metrics, '$.ad_clicks') IS NOT NULL AND json_extract(metrics, '$.ad_clicks') > 0 ORDER BY json_extract(metrics, '$.ad_clicks') DESC LIMIT 10"
        ;;
    
    "all-ad-clickers")
        execute_query "SELECT github_user_id, username, json_extract(metrics, '$.ad_clicks') as ad_clicks, json_extract(metrics, '$.ad_impressions') as ad_impressions FROM users WHERE (json_extract(metrics, '$.ad_clicks') IS NOT NULL AND json_extract(metrics, '$.ad_clicks') > 0) OR (json_extract(metrics, '$.ad_impressions') IS NOT NULL AND json_extract(metrics, '$.ad_impressions') > 0) ORDER BY ad_impressions DESC, ad_clicks DESC"
        ;;
    
    "user-metrics")
        if [ -z "$2" ]; then
            echo " Please provide a user ID"
            echo "Usage: $0 user-metrics <user_id>"
            exit 1
        fi
        execute_query "SELECT github_user_id, username, metrics FROM users WHERE github_user_id = '$2'"
        ;;
    
    "user-domains")
        if [ -z "$2" ]; then
            echo " Please provide a user ID"
            echo "Usage: $0 user-domains <user_id>"
            exit 1
        fi
        execute_query "SELECT d.id, d.user_id, u.username, d.domain, d.created_at FROM domains d JOIN users u ON d.user_id = u.github_user_id WHERE d.user_id = '$2' ORDER BY d.created_at DESC"
        ;;
    
    "user-profile")
        if [ -z "$2" ]; then
            echo " Please provide a user ID"
            echo "Usage: $0 user-profile <user_id>"
            exit 1
        fi
        echo "🔍 Getting complete profile for user $2"
        echo ""
        echo "👤 USER INFO & TIER:"
        execute_query "SELECT u.github_user_id, u.username, u.created_at, u.updated_at, COALESCE(ut.tier, 'seed') as tier FROM users u LEFT JOIN user_tiers ut ON u.github_user_id = ut.user_id WHERE u.github_user_id = '$2'"
        echo ""
        echo "📊 METRICS:"
        execute_query "SELECT metrics FROM users WHERE github_user_id = '$2'"
        echo ""
        echo "⚙️ PREFERENCES:"
        execute_query "SELECT preferences FROM users WHERE github_user_id = '$2'"
        echo ""
        echo "🌐 REGISTERED DOMAINS:"
        execute_query "SELECT d.id, d.domain, d.created_at FROM domains d WHERE d.user_id = '$2' ORDER BY d.created_at DESC"
        ;;
    
    "add-domain")
        if [ -z "$2" ] || [ -z "$3" ]; then
            echo " Please provide user ID and domain"
            echo "Usage: $0 add-domain <user_id> <domain>"
            exit 1
        fi
        echo "🔗 Adding domain '$3' to user $2"
        execute_query "INSERT INTO domains (user_id, domain, created_at) VALUES ('$2', '$3', datetime('now'))"
        echo "✅ Domain added successfully!"
        echo ""
        echo "📋 Updated domains for user $2:"
        execute_query "SELECT d.id, d.domain, d.created_at FROM domains d WHERE d.user_id = '$2' ORDER BY d.created_at DESC"
        ;;
    
    "remove-domain")
        if [ -z "$2" ]; then
            echo " Please provide domain ID"
            echo "Usage: $0 remove-domain <domain_id>"
            exit 1
        fi
        echo "🗑️ Removing domain with ID $2"
        execute_query "SELECT d.id, d.user_id, d.domain FROM domains d WHERE d.id = '$2'"
        echo ""
        echo "❓ Are you sure you want to remove this domain? (This is just a preview, domain not removed yet)"
        ;;
    
    "all-domains")
        execute_query "SELECT d.id, d.user_id, u.username, d.domain, d.created_at FROM domains d JOIN users u ON d.user_id = u.github_user_id ORDER BY d.created_at DESC LIMIT 20"
        ;;
    
    "user-count")
        execute_query "SELECT COUNT(*) as total_users FROM users"
        ;;
    
    "recent-users")
        execute_query "SELECT github_user_id, username, created_at FROM users WHERE created_at >= datetime('now', '-7 days') ORDER BY created_at DESC"
        ;;
    
    "table-info")
        execute_query "SELECT name FROM sqlite_master WHERE type='table'"
        ;;
    
    "users-schema")
        execute_query "PRAGMA table_info(users)"
        ;;
    
    "top-metrics")
        execute_query "SELECT 
            github_user_id, 
            username, 
            json_extract(metrics, '$.ad_clicks') as ad_clicks,
            json_extract(metrics, '$.api_calls') as api_calls,
            json_extract(metrics, '$.generations') as generations,
            created_at
        FROM users 
        WHERE metrics != '{}' 
        ORDER BY 
            COALESCE(json_extract(metrics, '$.ad_clicks'), 0) + 
            COALESCE(json_extract(metrics, '$.api_calls'), 0) + 
            COALESCE(json_extract(metrics, '$.generations'), 0) 
        DESC LIMIT 10"
        ;;
    
    *)
        show_usage
        ;;
esac
