#!/usr/bin/env bash
set -o errexit

echo "Installing gems..."
bundle install

echo "Installing JavaScript dependencies..."
npm ci

echo "Building SPA assets..."
npm run spa:build

echo "Clobbering old assets..."
bundle exec rails assets:clobber

echo "Precompiling assets for production..."
bundle exec rails assets:precompile

echo "✅ Build complete"