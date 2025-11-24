#!/bin/bash
# Setup backend for Railway deployment

echo "📦 Setting up backend for deployment..."

# Create backend directory
mkdir -p backend

# Copy backend files from parent directory
cp -r ../core backend/
cp -r ../video backend/
cp -r ../image backend/
cp -r ../config backend/
cp ../main.js backend/
cp ../package.json backend/
cp ../package-lock.json backend/ 2>/dev/null || true

# Create data directory
mkdir -p backend/data

echo "✅ Backend setup complete!"
