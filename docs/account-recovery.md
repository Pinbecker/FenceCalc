# Account Recovery

## Intended Model

This application is currently designed for managed internal deployment, not public self-service recovery.

The supported recovery paths are:

1. A company owner or admin resets another user's password from the Admin page.
2. A server operator resets a locked-out owner through the CLI runbook.

## In-Product Recovery

Owners and admins can:

- create users
- set a new password for another company user
- immediately revoke that user's active sessions
- review the resulting audit log entry

Restrictions:

- a user cannot reset their own password from the admin UI
- only an owner can reset another owner password

## Operator Recovery

Use this when the only owner is locked out or no other manager can perform recovery.

Command:

```powershell
npm run recover:user --workspace @fence-estimator/api -- --database C:\srv\fence-estimator\fence-estimator.db --email owner@example.com --password NewTemporaryPassword123
```

Effects:

- updates the stored password hash and salt
- revokes active sessions for that user
- records an audit log entry with `recoveryChannel=OPERATOR_CLI`

## Required Operating Discipline

- deliver temporary passwords over an approved out-of-band channel
- require the user to log in and rotate the password through a manager if policy requires it
- treat operator recovery as a privileged action and keep shell access limited
- review the audit log after each recovery
