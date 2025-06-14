#!/bin/bash
# Script to find next missing module

timeout 5 npm run dev 2>&1 | grep -E "Cannot find module|Cannot find package" | head -1