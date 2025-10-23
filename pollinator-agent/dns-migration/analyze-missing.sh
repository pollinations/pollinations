#!/bin/bash

echo "=== CRITICAL MISSING RECORDS ==="
echo ""
echo "MX Records (Email):"
comm -23 netlify-parsed.txt cloudflare-current.txt | grep "^MX"

echo ""
echo "TXT Records (Verification/SPF):"
comm -23 netlify-parsed.txt cloudflare-current.txt | grep "^TXT" | grep -v "^TXT\t_"

echo ""
echo "CNAME Records (Services):"
comm -23 netlify-parsed.txt cloudflare-current.txt | grep "^CNAME" | grep -v "^CNAME\t_" | head -20

echo ""
echo "=== AWS ACM Validation Records (can skip these) ==="
comm -23 netlify-parsed.txt cloudflare-current.txt | grep "^CNAME\t_" | wc -l
echo "validation records found"
