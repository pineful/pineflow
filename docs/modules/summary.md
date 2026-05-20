# Summary Module

## Responsibility

The summary module calculates today's worked time, first check-in, last check-out, and progress against the user's daily goal.

## Design Thought

The app should answer "how is my day going?" before it answers "what is my history?" The daily progress bar is therefore closer to the main action than the timeline.

## Current Rules

- Only records from the current local calendar day count toward today's summary.
- Paired check-in/check-out records produce completed duration.
- An active session contributes live elapsed time until checkout.
- The daily goal is stored as minutes and can be changed in 30-minute increments.

## Future Changes To Document

- Weekly rollups.
- Custom day boundary for night workers.
- Break tracking.
