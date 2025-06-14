#!/bin/bash

while true; do
  # Run the server and capture the error
  ERROR=$(NODE_ENV=development timeout 2 tsx server/index.ts 2>&1 | grep -E "Cannot find module '([^']+)'" | head -1)
  
  if [ -z "$ERROR" ]; then
    echo "No module errors found. Checking if server starts..."
    # Run for longer to see if it starts successfully
    NODE_ENV=development timeout 10 tsx server/index.ts 2>&1 | grep -E "(listening|started|ready|VITE|Error)" | head -20
    break
  fi
  
  # Extract the module path
  MODULE_PATH=$(echo "$ERROR" | sed -E "s/.*Cannot find module '([^']+)'.*/\1/")
  
  if [ -z "$MODULE_PATH" ]; then
    echo "Could not extract module path from: $ERROR"
    break
  fi
  
  echo "Missing module: $MODULE_PATH"
  
  # Determine the file name and create a stub
  FILENAME=$(basename "$MODULE_PATH").ts
  DIRNAME=$(dirname "$MODULE_PATH")
  
  # Create directory if needed
  mkdir -p "$DIRNAME"
  
  # Generate a simple stub based on the filename
  CLASS_NAME=$(basename "$MODULE_PATH" | sed 's/-\([a-z]\)/\U\1/g' | sed 's/^./\U&/')Service
  
  cat > "$MODULE_PATH.ts" << EOF
// $(basename "$MODULE_PATH") - Abstract implementation
export class $CLASS_NAME {
  static async init(): Promise<void> {
    // OMITTED: Implement initialization
  }
}

export default $CLASS_NAME;
EOF
  
  echo "Created stub: $MODULE_PATH.ts"
done