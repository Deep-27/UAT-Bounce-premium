#!/bin/bash
if [ -f server.pid ]; then PID=$(cat server.pid); kill $PID || true; rm server.pid; echo Stopped; else echo No PID; fi
