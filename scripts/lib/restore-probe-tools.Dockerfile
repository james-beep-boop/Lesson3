# Tools for scripts/test-restore-db-stack.sh — the shell an installation's operator has, in a box.
#
# The ops scripts run on a Linux server with bash 5, the Docker CLI, age and rclone. A developer's Mac
# has bash 3.2 and usually neither age nor rclone, and CI's runner has no age. Running the scripts in
# this image, against the host's Docker daemon through its socket, makes the stack test run the same
# way everywhere without installing anything on the host. Test-only; never part of an installation.
#
# Same pinned base as app/Dockerfile, so no new base image enters the repository.
FROM node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5
RUN apk add --no-cache bash coreutils docker-cli docker-cli-compose age rclone procps util-linux
