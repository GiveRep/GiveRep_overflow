#!/bin/bash

echo "Fixing all missing exports..."

while true; do
  # Run the server and capture export errors
  ERROR=$(tsx server/index.ts 2>&1 | grep -E "does not provide an export named|Cannot find module" | head -1)
  
  if [ -z "$ERROR" ]; then
    echo "No more export errors found!"
    # Try to run the server and see if it starts
    echo "Testing server startup..."
    tsx server/index.ts 2>&1 | head -50 | grep -E "listening|Server|started|ready|PORT|Database|Redis|VITE" && echo "Server appears to be starting!" && break
    break
  fi
  
  echo "Error: $ERROR"
  
  # Handle missing exports
  if [[ "$ERROR" == *"does not provide an export named"* ]]; then
    MODULE=$(echo "$ERROR" | sed -E "s/.*module '([^']+)'.*/\1/")
    EXPORT_NAME=$(echo "$ERROR" | sed -E "s/.*export named '([^']+)'.*/\1/")
    
    echo "Missing export '$EXPORT_NAME' in module '$MODULE'"
    
    # For now, just continue - would need more complex logic to auto-fix
    sleep 1
  fi
  
  # Break after 10 iterations to avoid infinite loop
  ((count++))
  if [ $count -ge 10 ]; then
    echo "Too many errors, stopping..."
    break
  fi
done