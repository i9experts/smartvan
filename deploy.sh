#!/bin/bash
set -e
echo "🚀 Deploying SmartVan NestJS..."
cd /var/www/smartvan
git pull origin main
npm install --production=false
npm run build
pm2 restart smartvan-nestjs
echo "✅ NestJS deployed — $(date)"
