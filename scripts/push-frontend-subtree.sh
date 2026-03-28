#!/usr/bin/env bash
# Push ONLY frontend/ to https://github.com/yogsbags/social-media-tool (remote: social-media-tool).
# Does NOT push to origin (pl-social-media).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if ! git remote get-url social-media-tool &>/dev/null; then
  echo "Add remote: git remote add social-media-tool https://github.com/yogsbags/social-media-tool.git" >&2
  exit 1
fi
SHA=$(git subtree split --prefix=frontend main | tail -n1)
git push --force social-media-tool "${SHA}:main"
echo "Pushed frontend-only subtree to social-media-tool/main at ${SHA}"
