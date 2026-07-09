#!/bin/bash
echo "🚀 SmartVan Deploy Script"
echo "========================="

# Backend
echo ""
echo "📦 Building Backend..."
cd /var/www/smartvan
git pull origin main
npm run build
pm2 restart smartvan-nestjs --update-env
echo "✅ Backend deployed!"

# Admin Panel
echo ""
echo "🖥️ Building Admin Panel..."
cd /var/www/smartvan-admin
git pull origin main
npm run build
pm2 restart smartvan-admin --update-env
echo "✅ Admin Panel deployed!"

echo ""
echo "========================="
echo "✅ All done! SmartVan is live."
pm2 status
