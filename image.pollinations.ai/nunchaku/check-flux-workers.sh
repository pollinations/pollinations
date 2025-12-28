#!/bin/bash
# Quick health check for IO.NET Flux Workers
# Shows recent activity and any errors

echo "=== IO.NET Flux Workers Health Check ==="
echo "Time: $(date)"
echo ""

for host in io4090-6 io4090-7 io4090-8 io4090-9 io4090-10; do
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📍 $host"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # All workers now use standardized service names
    services=("ionet-flux-gpu0.service" "ionet-flux-gpu1.service")
    
    # Check service status
    echo "🔍 Service Status:"
    ssh $host "sudo systemctl is-active ${services[@]}" | while read status; do
        if [ "$status" = "active" ]; then
            echo "  ✅ Active"
        else
            echo "  ❌ $status"
        fi
    done
    
    # Count recent requests (last 2 minutes)
    echo ""
    echo "📊 Recent Activity (last 2 min):"
    request_count=$(ssh $host "sudo journalctl -u ${services[0]} -u ${services[1]} --since '2 minutes ago' | grep -c 'Original dimensions'" 2>/dev/null || echo "0")
    echo "  Requests processed: $request_count"
    
    # Check for OOM errors
    echo ""
    echo "⚠️  CUDA OOM Errors (last 5 min):"
    oom_count=$(ssh $host "sudo journalctl -u ${services[0]} -u ${services[1]} --since '5 minutes ago' 2>/dev/null | grep -E 'CUDA out of memory|OutOfMemoryError|RuntimeError.*memory' | wc -l" || echo "0")
    oom_count=$(echo "$oom_count" | tr -d ' ')  # Remove whitespace
    if [ "$oom_count" -eq 0 ]; then
        echo "  ✅ No errors"
    else
        echo "  ❌ $oom_count errors found"
    fi
    
    # Show last 3 processed dimensions
    echo ""
    echo "📐 Last 3 Requests:"
    ssh $host "sudo journalctl -u ${services[0]} -u ${services[1]} --since '2 minutes ago' | grep -E 'Original dimensions|Adjusted dimensions' | tail -6" 2>/dev/null | sed 's/^/  /'
    
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Health check complete"
