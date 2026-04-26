#!/bin/bash
ROOT="$(cd "$(dirname "$0")" && pwd)"

# Kill any existing processes on port 3001
lsof -ti :3001 | xargs kill -9 2>/dev/null

# Start backend
cd "$ROOT/backend"
node server.js &
BACKEND_PID=$!
echo "Backend started (pid $BACKEND_PID)"

# Start frontend dev server
cd "$ROOT/frontend"
npx vite &
FRONTEND_PID=$!
echo "Frontend started (pid $FRONTEND_PID)"

# Wait for frontend to be ready
echo "Waiting for frontend..."
until curl -s http://localhost:5173 > /dev/null 2>&1; do sleep 0.5; done
echo "Frontend ready"

# Start Electron
cd "$ROOT/electron"
VITE_DEV=1 npx electron . &
ELECTRON_PID=$!
echo "Electron started (pid $ELECTRON_PID)"

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID $ELECTRON_PID 2>/dev/null" EXIT INT TERM
wait $ELECTRON_PID
