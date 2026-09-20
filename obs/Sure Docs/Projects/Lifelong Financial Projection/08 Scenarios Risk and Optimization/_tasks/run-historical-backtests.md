---
pm-task: true
projectId: "[[08 Scenarios Risk and Optimization|08 Scenarios Risk and Optimization]]"
parentId:
id: t_lfp_702
title: Run historical backtests
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - risk
  - historical-data
subtaskIds: []
dependencies:
  - "[[make-simulation-results-auditable-and-repeatable|Make simulation results auditable and repeatable]]"
  - "[[model-investment-returns-dividends-and-fees|Model investment returns, dividends, and fees]]"
  - "[[model-real-and-nominal-currency-values|Model real and nominal currency values]]"
timeEstimate: 40
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Replay plans against versioned historical investment, dividend, bond, and inflation sequences.

## Acceptance criteria
- Deterministic backtests support selected start year, chronological sequences, configurable loopback, and no-looping behavior.
- Probabilistic historical sampling supports random years, chronological windows, and block bootstrap with configurable block length.
- Source datasets expose coverage dates, asset definitions, inflation series, gaps, and version.
- Each trial identifies the sampled historical sequence and preserves cross-variable relationships intended by the sampling method.
- Data updates add years without altering previously versioned results.

## Verification
- Reproduce known historical windows and prove looping, no-looping, random, and block-bootstrap sequence construction.

Project: [[08 Scenarios Risk and Optimization]]
