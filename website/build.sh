#!/bin/bash
# Build script for OpenTwins website
# Run before deploying: ./build.sh

set -e
cd "$(dirname "$0")"

# 1. Compile Tailwind CSS
echo "Building Tailwind CSS..."
npx tailwindcss@3 -i input.css -o styles.css --minify -c tailwind.config.js
echo "  styles.css: $(wc -c < styles.css | tr -d ' ') bytes"

# 2. Update sitemap lastmod to today
TODAY=$(date +%Y-%m-%d)
sed -i '' "s|<lastmod>.*</lastmod>|<lastmod>${TODAY}</lastmod>|" sitemap.xml
echo "  sitemap.xml lastmod: ${TODAY}"

echo "Done."
