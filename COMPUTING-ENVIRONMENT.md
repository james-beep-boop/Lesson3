# Computing Environment

Canonical shared notes about the machines available to Hermes/Codex agents.
This is the machine map for the whole workspace, so every machine can read the same source of truth.

## Usage

- Read this when deciding which machine to use for a task.
- Keep it public, markdown-only, and free of secrets.
- Update it when a machine's hostname, OS, role, or availability changes.
- Hardware specs inform local model and workload decisions.

## Machines

### Rock 5B

- **Device:** Radxa Rock 5B (ARM SBC)
- **OS:** Ubuntu Desktop 24.04
- **Hostname:** `rock5b`
- **Tailscale:** `rock5b.tail49b05.ts.net`
- **Role:** ARM-based always-on service host
- **Best use:** Persistent lightweight automation and ARM-native services

**Hardware:**
- **CPU:** ARM processor (not x86_64)
- **Memory:** 16GB RAM
- **Storage:** 512GB NVMe
- **WiFi:** Intel AX210NGW adapter (power management disabled for stability)

### Nvidia DGX Spark

- **Device:** Nvidia DGX Spark
- **OS:** DGX OS based on Ubuntu 24.04 LTS
- **Hostname:** `jhm-spark`
- **Tailscale:** `jhm-spark.tail49b05.ts.net`
- **Role:** Local-model / GPU-heavy machine
- **Best use:** Local LLMs, heavy inference, and GPU workloads

**Hardware:**
- **RAM:** 128GB
- **GPU:** GPU-heavy configuration (exact specs TBD)
- **Primary use case:** Local LLMs and heavy inference tasks

### Apple MacBook Air M5

- **Device:** Apple MacBook Air M5
- **OS:** macOS Tahoe 26.5
- **Hostname:** `jamess-m5-macbook-air`
- **Tailscale:** `jamess-m5-macbook-air.tail49b05.ts.net`
- **Role:** Interactive Hermes / Codex machine
- **Best use:** Interactive coding, agentic work, and Hermes-driven tasks

**Hardware:**
- **Chip:** Apple M5
- **Memory:** TBD
- **Storage:** TBD
- **Services:** Hermes v0.16.0 running

### Apple Mac mini M4

- **Device:** Apple Mac mini
- **OS:** macOS 26.5.1 (25F80)
- **Hostname:** `mac-mini`
- **Tailscale:** `mac-mini.tail49b05.ts.net`
- **Role:** Primary control and development workstation
- **Best use:** Main coding work and coordination of other agents via SSH or Telegram

**Hardware:**
- **Model:** Mac16,10 / MU9E3LL/A
- **Chip:** Apple M4
- **CPU:** 10 cores (4 performance, 6 efficiency)
- **GPU:** Built-in Apple GPU (Metal 4)
- **Memory:** 16GB RAM
- **Display:** DELL U2723QE (5120 × 2880; UI at 2560 × 1440 @ 60 Hz)
- **Control tools:** Codex, Claude Code
- **Dashboards:** Hermes, NanoClaw

## Shared workspace notes

- **Workspace root:** `/Users/james/Documents/GitHub`
- **GitHub namespace:** `james-beep-boop`
- **Repo for these notes:** `workstreams` repository
- **All four machines:** permanently reachable over Tailscale
- **All IP addresses (100.x.x.x):** Tailscale addresses; use `rock5b.tail49b05.ts.net`, etc. for hostname-based access
- **Preferred control machine:** Mac mini M4
- **Preferred interactive Hermes machine:** MacBook Air M5

## Application hosting note (SHEQL / Lesson3)

The lesson-plan platform (Lesson3) is a **Node.js + PostgreSQL** app that embeds the CBE DOCX generator in-process.

- Any of the always-on machines (Rock 5B, Mac mini) can host the Node app + Postgres for dev/staging; the Rock 5B suits an always-on service role.
- The DGX Spark remains the GPU/local-LLM machine if AI assistance is added later.
- **Offline target:** a single Node + Postgres deployment on a local box at a school — no DreamHost, no second runtime.

## Source of truth

This file is intended to be the shared computing-environment reference for all machines and agents.
If the setup changes, update this file first and then sync the repo.
