#!/bin/sh
# Applies pending database migrations and inserts any missing plans.
# Used as the release's pre-deploy step, so a new version only goes live once
# the database matches the code. Both steps are safe to run repeatedly, and
# neither touches existing rows.
set -eu
cd /app/migrator
node node_modules/prisma/build/index.js migrate deploy
node node_modules/prisma/build/index.js db execute --file ./plans.sql
echo "Database is up to date."
