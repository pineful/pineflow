# Storage Module

## Responsibility

The storage module persists commute sessions and user settings in PostgreSQL through the Express API.

## Design Thought

PostgreSQL is the durable source of truth. The browser should not own attendance data because Pineflow is moving toward a real hosted service, GitHub-backed development, and AWS deployment.

## Current Contract

- `work_sessions` stores check-in/check-out sessions.
- `user_settings` stores per-owner settings such as `daily_goal_minutes`.
- One active session per owner is enforced by a partial unique index.
- The API returns the existing `CommuteState` shape so the UI can stay simple.

## Future Changes To Document

- Formal migration tooling.
- Authentication-backed owner keys.
- Encrypted backups.
