#!/bin/bash

PID_OF_CHILD=0
DONE=0
cleanup ()
{
echo killing $PID_OF_CHILD
DONE=1
kill -s SIGTERM $PID_OF_CHILD
exit 0
}

trap cleanup SIGINT SIGTERM

while (( DONE != 1 ))
do
        echo "(Re)Starting $1..."
        bash -c "$1" &
        PID_OF_CHILD=$!
        wait $PID_OF_CHILD
        sleep 10
done
