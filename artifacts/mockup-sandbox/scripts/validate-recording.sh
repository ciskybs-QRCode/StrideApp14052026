#!/bin/bash
if grep -q "startRecording" artifacts/mockup-sandbox/src/lib/video/hooks.ts && grep -q "stopRecording" artifacts/mockup-sandbox/src/lib/video/hooks.ts; then
  echo "Validation passed: startRecording and stopRecording found."
  exit 0
else
  echo "Validation failed."
  exit 1
fi
