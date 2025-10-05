# Wildcard Domain Support

## Overview
The auth service now supports wildcard domain patterns using the `*.example.com` syntax, allowing users to register a single domain entry that covers all subdomains.

## How It Works

### Database Query Strategy
1. **Step 1**: Try exact match first (fastest, most common case)
2. **Step 2**: If no exact match, try wildcard patterns with secure subdomain matching

### Security Features
- **Proper Subdomain Matching**: `*.example.com` matches `app.example.com` but NOT `maliciousexample.com`
- **Domain Boundary Checking**: Prevents domain spoofing attacks
- **Parent Domain Protection**: `*.example.com` doesn't match `example.com` itself

### Performance Characteristics
- **Most Requests**: 1 database query (exact match) - same as before
- **Wildcard Fallback**: 2 database queries maximum - minimal impact
- **Memoization**: Results cached for 30 seconds, eliminating repeated queries

## Usage Examples

### User Registration
Users can now register domains in two ways:

```
# Exact domain (traditional)
example.com

# Wildcard domain (new)
*.example.com
```

### Matching Behavior

| Registered Domain | Test Domain | Matches | Reason |
|------------------|-------------|---------|---------|
| `example.com` | `example.com` | ✅ | Exact match |
| `*.example.com` | `app.example.com` | ✅ | Valid subdomain |
| `*.example.com` | `api.example.com` | ✅ | Valid subdomain |
| `*.example.com` | `sub.app.example.com` | ✅ | Valid nested subdomain |
| `*.example.com` | `maliciousexample.com` | ❌ | Not a subdomain |
| `*.example.com` | `example.com` | ❌ | Parent domain excluded |
| `example.com` | `app.example.com` | ❌ | Exact match only |

## SQL Implementation

### Exact Match Query (Step 1)
```sql
SELECT u.github_user_id as user_id, u.username, COALESCE(t.tier, 'seed') as tier
FROM domains d
JOIN users u ON d.user_id = u.github_user_id
LEFT JOIN user_tiers t ON u.github_user_id = t.user_id
WHERE d.domain = ?
LIMIT 1
```

### Wildcard Match Query (Step 2)
```sql
SELECT u.github_user_id as user_id, u.username, COALESCE(t.tier, 'seed') as tier
FROM domains d
JOIN users u ON d.user_id = u.github_user_id
LEFT JOIN user_tiers t ON u.github_user_id = t.user_id
WHERE d.domain LIKE '*.%' 
  AND LENGTH(d.domain) > 2
  AND ? LIKE '%' || SUBSTR(d.domain, 2)
  AND ? != SUBSTR(d.domain, 3)
ORDER BY LENGTH(d.domain) DESC
LIMIT 1
```

### Query Logic Explanation
- `d.domain LIKE '*.%'`: Find wildcard entries
- `LENGTH(d.domain) > 2`: Exclude invalid `*.` entries
- `? LIKE '%' || SUBSTR(d.domain, 2)`: Check if test domain ends with `.example.com`
- `? != SUBSTR(d.domain, 3)`: Exclude parent domain (`example.com`)
- `ORDER BY LENGTH(d.domain) DESC`: Most specific match first

## Migration Strategy

### Backward Compatibility
- ✅ **No Breaking Changes**: Existing exact domains continue working
- ✅ **Opt-in Feature**: Users can choose to use wildcards or not
- ✅ **Database Schema**: No changes required to existing schema

### User Experience
1. **Dashboard Update**: Add wildcard option in domain registration UI
2. **Documentation**: Update user guides with wildcard examples
3. **Validation**: Add client-side validation for wildcard format

## Security Benefits
- **Eliminates Substring Vulnerabilities**: No more `example.com` matching `maliciousexample.com`
- **Proper Domain Boundaries**: Only legitimate subdomains match
- **Attack Prevention**: Prevents domain spoofing and typosquatting

## Performance Impact
- **Typical Case**: No performance change (exact matches)
- **Worst Case**: +1 database query (~2-5ms additional)
- **Best Case**: 0 queries (memoization cache hit)
- **Overall Impact**: Minimal, well within acceptable limits

## Testing
Run the test suite to verify functionality:
```bash
node test-wildcard-domains.js
```

All 15 test cases should pass, covering:
- Exact matches
- Valid wildcard matches  
- Security boundary tests
- Edge cases and invalid patterns
