#!/usr/bin/env bash
# Publish dist/ to the public demo server. Run `npm run build` first (npm run deploy does both).
set -euo pipefail
cd "$(dirname "$0")/.."
rsync -rzlt --chmod=Dug=rwx,Fug=rw,o-rwx --delete --stats \
	--rsync-path="sudo -u vu2006 rsync" --rsh="ssh" \
	dist/ root@saygoweb.com:/var/www/virtual/saygoweb.com/demo/htdocs/thrust/
