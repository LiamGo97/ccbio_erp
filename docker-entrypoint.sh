#!/bin/sh

# Start NestJS backend (which serves Next.js static files)
cd /app/backend
exec node dist/main.js

