# Recording Module

## Responsibility

The recording module owns the user's active session and completed check-in/check-out events.

## Design Thought

Recording should feel decisive. One large action starts or ends the current session. The app avoids secondary confirmations because the action is reversible in a future edit-history feature, and the first version values low friction.

## Current Rules

- A check-in creates an active session and a `check-in` record.
- A check-out clears the active session and creates a `check-out` record.
- While active, mode and note are locked to preserve the meaning of the started session.

## Future Changes To Document

- Manual correction of times.
- Multiple sessions per day editing.
- Auto-suggested checkout reminders.
