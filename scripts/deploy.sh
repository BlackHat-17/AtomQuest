#!/bin/bash

# GoalTrack Deployment Script
# This script helps deploy the application to Render and Vercel

set -e

echo "🚀 GoalTrack Deployment Script"
echo "================================"

# Check if required tools are installed
check_dependencies() {
    echo "📋 Checking dependencies..."
    
    if ! command -v git &> /dev/null; then
        echo "❌ Git is required but not installed."
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js is required but not installed."
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        echo "❌ npm is required but not installed."
        exit 1
    fi
    
    echo "✅ All dependencies are installed."
}

# Build and test locally
build_and_test() {
    echo "🔨 Building and testing locally..."
    
    # Backend
    echo "Building backend..."
    cd backend
    npm ci
    npm run build
    npm run type-check
    cd ..
    
    # Frontend
    echo "Building frontend..."
    cd frontend
    npm ci
    npm run build
    cd ..
    
    echo "✅ Local build successful."
}

# Deploy to platforms
deploy() {
    echo "🚀 Starting deployment..."
    
    # Commit and push changes
    echo "📤 Pushing to GitHub..."
    git add .
    git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S')" || echo "No changes to commit"
    git push origin main
    
    echo "✅ Code pushed to GitHub."
    echo ""
    echo "📋 Next steps:"
    echo "1. Go to Render Dashboard: https://dashboard.render.com"
    echo "2. Create a new Blueprint and connect your GitHub repo"
    echo "3. Go to Vercel Dashboard: https://vercel.com/dashboard"
    echo "4. Import your GitHub repository"
    echo "5. Configure environment variables as described in deploy.md"
    echo ""
    echo "🔗 Useful links:"
    echo "   - Deployment Guide: ./deploy.md"
    echo "   - Render Dashboard: https://dashboard.render.com"
    echo "   - Vercel Dashboard: https://vercel.com/dashboard"
}

# Main execution
main() {
    check_dependencies
    build_and_test
    deploy
    
    echo ""
    echo "🎉 Deployment preparation complete!"
    echo "Follow the instructions above to complete the deployment."
}

# Run main function
main "$@"