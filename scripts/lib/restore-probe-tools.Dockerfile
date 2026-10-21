# Tools for scripts/test-restore-db-stack.sh — the shell an installation's operator has, in a box.
#
# The ops scripts run on a Linux server with bash 5, the Docker CLI, age and rclone. A developer's Mac
# has bash 3.2 and usually neither age nor rclone, and CI's runner has no age. Running the scripts in
# this image, against the host's Docker daemon through its socket, makes the stack test run the same
# way everywhere without installing anything on the host. Test-only; never part of an installation.
#
# Same pinned base as app/Dockerfile, so no new base image enters the repository.
FROM node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
RUN apk add --no-cache bash coreutils docker-cli docker-cli-compose age rclone procps
