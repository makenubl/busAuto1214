#!/bin/bash
# EC2 Setup Script for Bus Dealer WhatsApp Bot
# Run this on a fresh Ubuntu EC2 instance (t2.micro works fine)
# Usage: bash setup-ec2.sh

set -e

echo "🚌 Bus Dealer Bot — EC2 Setup"
echo "=============================="

# Update system
echo "📦 Updating system..."
sudo apt-get update -y
sudo apt-get upgrade -y

# Install Node.js 20
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install git (usually pre-installed)
sudo apt-get install -y git

# Clone the repo
echo "📥 Cloning repository..."
cd ~
if [ -d "busAuto1214" ]; then
  echo "Repository already exists, pulling latest..."
  cd busAuto1214
  git pull
else
  git clone https://github.com/makenubl/busAuto1214.git
  cd busAuto1214
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create .env if it doesn't exist
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "⚠️  IMPORTANT: Edit .env with your API keys!"
  echo "   Run: nano .env"
  echo ""
  echo "   Fill in:"
  echo "   - DEALER_PHONE (e.g., 923001234567)"
  echo "   - ANTHROPIC_API_KEY"
  echo "   - OPENAI_API_KEY"
  echo ""
  read -p "Press Enter after editing .env to continue..."
  nano .env
fi

# Create required directories
mkdir -p auth_state media data

# Start with PM2
echo "🚀 Starting bot with PM2..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup | tail -1 | bash 2>/dev/null || true

echo ""
echo "✅ Bot is running!"
echo ""
echo "📱 Scan the QR code to connect WhatsApp:"
echo "   pm2 logs bus-dealer-bot"
echo ""
echo "Useful commands:"
echo "   pm2 logs bus-dealer-bot    — View logs (scan QR here)"
echo "   pm2 restart bus-dealer-bot — Restart bot"
echo "   pm2 stop bus-dealer-bot    — Stop bot"
echo "   pm2 status                 — Check status"
echo ""
echo "To update later:"
echo "   cd ~/busAuto1214 && git pull && npm install && pm2 restart bus-dealer-bot"
