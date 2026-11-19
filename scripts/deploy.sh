#!/usr/bin/env bash
# Publish dist/ to the public demo server. Run `npm run build` first (npm run deploy does both).
#
# The defaults are the manual deploy: as root, switching to the domain user on
# the server. CI (.github/workflows/ci.yml) logs in as the domain user directly,
# so it sets DEPLOY_USER, DEPLOY_HOST and DEPLOY_PATH and an empty DEPLOY_SUDO_USER.
# Its key is limited by rrsync to the demo directory, so its DEPLOY_PATH is ./
#   DEPLOY_USER       ssh login                    (default root)
#   DEPLOY_HOST       server                       (default saygoweb.com)
#   DEPLOY_PATH       target dir, trailing slash   (default /var/www/virtual/saygoweb.com/demo/htdocs/thrust/)
#   DEPLOY_SUDO_USER  run rsync on the server as   (default vu2006; empty for none)
#   DEPLOY_SSH        ssh command for rsync        (default ssh)
set -euo pipefail
cd "$(dirname "$0")/.."

user="${DEPLOY_USER:-root}"
host="${DEPLOY_HOST:-saygoweb.com}"
path="${DEPLOY_PATH:-/var/www/virtual/saygoweb.com/demo/htdocs/thrust/}"
sudo_user="${DEPLOY_SUDO_USER-vu2006}"
ssh_cmd="${DEPLOY_SSH:-ssh}"

if [ ! -f dist/index.html ]; then
	echo "dist/index.html is missing; run npm run build first" >&2
	exit 1
fi

rsync_path=()
if [ -n "$sudo_user" ]; then
	rsync_path=(--rsync-path="sudo -u $sudo_user rsync")
fi

rsync -rzlt --chmod=Dug=rwx,Fug=rw,o-rwx --delete --stats \
	"${rsync_path[@]}" --rsh="$ssh_cmd" \
	dist/ "$user@$host:$path"
