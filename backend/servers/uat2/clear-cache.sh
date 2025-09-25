#!/bin/bash
if [ -d cache ]; then rm -rf cache/*; echo Cache cleared; else mkdir -p cache; echo Cache created; fi
