# Customer to Drawings UX Audit

Date: 2026-03-29

## Executive Summary

The direction makes sense: bring back a real customer page, make drawings the primary unit of work, and keep root drawings plus revisions grouped together.

The important constraint is that jobs are not just a label in the current system. Right now they are the operational container for tasks, quotes, estimate controls, activity, and some navigation. Because of that, the safest path is:

1. Make the UX drawings-first now.
2. Keep jobs as a hidden/internal record in phase 1.
3. Only remove or rework the job model after the new workflow settles.

My recommendation is to treat this as a UX simplification first, not a full data-model deletion in the same pass.

## Evidence Sources

This audit is based on the current implementation in:

- `apps/web/src/App.tsx`
- `apps/web/src/CustomerPickerModal.tsx`
- `apps/web/src/CustomersPage.tsx`
- `apps/web/src/CustomerPage.tsx`
- `apps/web/src/JobPage.tsx`
- `apps/web/src/DrawingPage.tsx`
- `apps/web/src/EstimatePage.tsx`
- `apps/web/src/EditorPage.tsx`
- `apps/web/src/EditorDrawingSaveModal.tsx`
- `apps/web/src/useWorkspacePersistence.ts`
- `apps/web/src/DashboardPage.tsx`
- `packages/contracts/src/domain.ts`
- `apps/api/src/services/drawingService.ts`
- `apps/api/src/services/jobService.ts`
- `apps/api/src/services/quoteService.ts`
- `apps/api/src/repository/types.ts`

## Current-State Audit

### 1. The top-level information architecture is fighting the product

Today `#/customers` and `#/drawings` open a `CustomerPickerModal` over the current page instead of taking the user to a full browse view. The app still has a proper `CustomerPage`, `CustomersPage`, and `DrawingsPage`, but the active route wiring is centered around the modal and the job workspace.

What this means in practice:

- Browsing customers feels secondary, even though customers are the top-level business object.
- Drawings are split between a modal picker, a job page, a drawing page, and the editor.
- The user has to understand the app's internal structure before they can understand where their work lives.

### 2. Jobs are currently the real operational container

Jobs are not just UI copy right now.

In the current implementation:

- Creating a job also creates its primary drawing.
- Creating a drawing without a `jobId` auto-creates a job behind the scenes.
- Tasks are job records with an optional drawing link.
- Estimate, quotes, commercial controls, and activity are all routed through the job workspace.
- The estimate page immediately redirects into the job page.

This is the biggest architectural constraint behind your idea.

### 3. The drawing model is already close to the future workflow

The good news is that the drawing model already supports the workflow you want:

- Root drawings and revisions are explicitly modeled with `parentDrawingId` and `revisionNumber`.
- The drawing detail page already groups an original drawing with its revisions.
- The editor mostly thinks in terms of "drawing + customer", not "job".
- Tasks can already point to a drawing while still being stored under the job.

So the foundations for a drawings-first UX are already there.

### 4. The customer experience is still job-first

The current customer detail experience is framed as a "customer workspace" made of jobs:

- The summary calls out active jobs.
- The main primary action is `New job`.
- The core listing is a jobs grid, not a drawings grid.
- Opening estimates sends the user into the job workspace.

This makes the customer page feel heavier than it needs to be for a drawings-first product.

### 5. There is route and page overlap around the same work

Right now the same work can appear in several places:

- `CustomerPage`
- `JobPage`
- `DrawingPage`
- `EditorPage`
- `EstimatePage`

That overlap makes the system harder to learn and harder to maintain. A simpler mental model would be:

- Customer
- Drawing chain
- Revision
- Editor

## Recommendation

Yes: bring back the full customer page and move to a drawings-first UX.

But do it in two layers:

- Phase 1: simplify the user experience while keeping jobs as an internal implementation detail.
- Phase 2: decide whether the job model still earns its keep after the UX is stable.

This gives you the simpler product you want without forcing a large risky migration at the same time.

## Target UX Model

### Primary hierarchy

- Customer
- Root drawing chain
- Revision

### Secondary capabilities attached to a drawing chain

- Tasks
- Quotes
- Activity
- Estimate controls

### Suggested page model

- `CustomersPage`: full browse view, filters, search, create customer.
- `CustomerPage`: customer profile plus drawing chains.
- `DrawingPage`: root drawing plus revisions, tasks, quotes, activity, estimate tab.
- `EditorPage`: edit the selected revision.

### Suggested user flow

1. Open `Customers`.
2. Pick a customer from a real page, not a modal.
3. See drawing chains for that customer immediately.
4. Open a drawing chain.
5. Review revisions, tasks, quote history, and activity in one place.
6. Open the editor only when changing geometry.

## Product Decisions I Recommend

### 1. Bring back the customer page as the default customer entry point

Strong yes.

The modal is fine as a quick picker from the editor, but it should not be the main browse experience. Customer browsing is too central to be hidden behind an overlay.

### 2. Replace "jobs" with "drawings" in the customer-facing workflow

Strong yes in the UI.

On the customer page, the main object should be a drawing chain:

- Root drawing name
- Latest revision status
- Revision count
- Last updated
- Open task count
- Latest quote value or quote state

Users should not need to care whether a hidden job record exists.

### 3. Keep root drawings and revisions together

Strong yes.

This is already the cleanest part of the current model and should become the center of the workflow.

### 4. Let tasks belong to the drawing chain, with optional revision specificity

Recommended behavior:

- Every task belongs to a root drawing chain.
- A task may optionally reference a specific revision when needed.

That keeps the task list stable even as revisions change, while still allowing revision-specific work.

### 5. Keep the all-drawings view as secondary, not primary

Recommended.

A company-wide drawing library can still exist, but it should not replace the customer-first path. It should be a secondary operational view, like the tasks page.

## Phased Delivery Plan

### Phase 1: UX Simplification Without Data Migration

Goal: deliver the simpler product quickly with low risk.

Changes:

- Route `#/customers` to the real `CustomersPage` instead of the modal.
- Keep the modal only as an editor shortcut.
- Make `CustomerPage` the primary place to manage work for a customer.
- Replace the jobs grid on `CustomerPage` with grouped drawing chains.
- Rename `New job` to `New drawing`.
- Keep creating the hidden job record under the hood for now.
- Deep-link estimates, tasks, and activity from a drawing-first page instead of a job-first page wherever possible.
- Reduce visible use of the word "job" in navigation and headers.

Expected outcome:

- Much simpler mental model for users.
- Very little migration risk.
- Immediate product clarity.

### Phase 2: Drawing-First Workspace Refactor

Goal: move the operational workspace from `JobPage` into `DrawingPage`.

Changes:

- Expand `DrawingPage` to become the main working page for a root drawing chain.
- Add tabs or sections for:
  - Overview
  - Revisions
  - Tasks
  - Estimate
  - Quotes
  - Activity
- Change dashboard and tasks deep links to open the drawing workspace first.
- Keep job-backed APIs behind the scenes until the UI is stable.

Expected outcome:

- One obvious place for active work.
- Much less route overlap.
- Cleaner handoff between customer page, drawing page, and editor.

### Phase 3: Decide Whether to Remove Jobs or Keep Them Hidden

Goal: make an intentional architectural choice after the UX proves out.

Option A: keep jobs as an internal container

- Cheapest and safest.
- Users never see jobs.
- Backend keeps job-scoped tasks, quotes, and commercial controls.

Option B: fully migrate to drawing-scoped records

- Move tasks from `jobId` to `rootDrawingId` or `drawingId`.
- Move estimate/commercial state to the root drawing chain.
- Allow quotes to exist without a backing job.
- Retire job routes and job services once migration is complete.

My recommendation today: choose Option A first, then reassess later.

## Key Risks

### 1. Hidden architectural coupling

If we try to remove jobs immediately, the change touches tasks, quotes, estimate controls, activity, dashboard summaries, API contracts, and deletion/archive rules all at once.

### 2. Commercial inputs are job-owned today

If a root drawing chain becomes the main record, we need to decide whether commercial controls belong to:

- the root drawing chain, or
- each quote snapshot only.

### 3. Task ownership needs a clear rule

Tasks should not bounce unpredictably between revisions. The root chain should be the stable anchor.

## Recommended Next Build Slice

If we want the highest-value first implementation, I would build this sequence:

1. Re-enable a full `CustomersPage` route as the default customer browse experience.
2. Rework `CustomerPage` to show drawing chains instead of jobs.
3. Rename creation flows to `New drawing` while preserving hidden jobs underneath.
4. Expand `DrawingPage` so it absorbs the most important read-only job workspace functions.
5. Rewire dashboard and task links toward customer and drawing pages.

## Final Recommendation

You are right about the product direction.

The cleanest move is not "delete jobs everywhere right now." The cleanest move is:

- make customers and drawings the visible product model,
- keep jobs hidden for now,
- then decide later whether the internal job record should survive.

That gives you the simpler UX immediately while keeping the migration controlled.
