#!/usr/bin/env bash
# Builds the Embarko upload (source only) at /tmp/smartfin-embarko.tar.gz without touching the project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT=/tmp/smartfin-embarko
rm -rf "$OUT" && mkdir -p "$OUT"
tar -C "$ROOT" --exclude=node_modules --exclude=.git --exclude='.env*' --exclude=dist --exclude=.output \
  --exclude=.lovable --exclude=.tanstack --exclude=tsconfig.tsbuildinfo --exclude='*.db' --exclude='SMARTFIN_*.md' -cf - . | tar -C "$OUT" -xf -
# Embarko runs `build` then `start`.
node -e '
const fs=require("fs");const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p));
j.scripts.build="node deploy/embarko/build.mjs";j.scripts.start="node deploy/embarko/start.mjs";
fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n");' "$OUT/package.json"
tar -czf /tmp/smartfin-embarko.tar.gz -C "$OUT" .
echo "/tmp/smartfin-embarko.tar.gz"
