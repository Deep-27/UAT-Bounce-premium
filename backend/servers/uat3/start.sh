#!/bin/bash
nohup node server.js > server.log 2>&1 & echo $! > server.pid
echo Started
