#!/bin/bash

SERVICE_NAME="flux-schnell"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_SCRIPT="$SCRIPT_DIR/start_server.sh"

case "$1" in
    start)
        echo "Starting FLUX Schnell service..."
        cd "$SCRIPT_DIR"
        nohup ./start_server.sh > flux_server.log 2>&1 &
        echo $! > flux_server.pid
        echo "Service started. PID: $(cat flux_server.pid)"
        echo "Logs: tail -f flux_server.log"
        ;;
    stop)
        if [[ -f flux_server.pid ]]; then
            PID=$(cat flux_server.pid)
            if kill -0 $PID 2>/dev/null; then
                kill $PID
                rm flux_server.pid
                echo "Service stopped"
            else
                echo "Service not running"
                rm -f flux_server.pid
            fi
        else
            echo "PID file not found. Service may not be running."
        fi
        ;;
    status)
        if [[ -f flux_server.pid ]]; then
            PID=$(cat flux_server.pid)
            if kill -0 $PID 2>/dev/null; then
                echo "Service is running (PID: $PID)"
            else
                echo "Service is not running (stale PID file)"
                rm -f flux_server.pid
            fi
        else
            echo "Service is not running"
        fi
        ;;
    restart)
        $0 stop
        sleep 2
        $0 start
        ;;
    logs)
        if [[ -f flux_server.log ]]; then
            tail -f flux_server.log
        else
            echo "No log file found"
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|status|restart|logs}"
        exit 1
        ;;
esac
