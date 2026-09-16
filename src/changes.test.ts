import assert from "node:assert/strict"
import test from "node:test"

import { ChangeTransitionError, transitionChange } from "./changes.ts"

const actor = { sub: "user-1", email: "nic@example.com", name: "Nic" }

test("change drafts submit, approve, apply, and rollback with an audit event", () => {
  const submitted = transitionChange({
    status: "draft",
    action: "submit",
    actor,
  })
  assert.equal(submitted.status, "pending_approval")

  const approved = transitionChange({
    status: submitted.status,
    action: "approve",
    actor,
    lockhavenAccessRequestId: "access-req-1",
    now: new Date("2026-09-16T15:00:00.000Z"),
  })
  assert.equal(approved.status, "approved")
  assert.equal(approved.approvedByEmail, actor.email)
  assert.equal(approved.event.detail.reusedAccessApproval, true)
  assert.equal(approved.event.detail.lockhavenAccessRequestId, "access-req-1")

  const applied = transitionChange({
    status: approved.status,
    action: "apply",
    actor,
  })
  assert.equal(applied.status, "applied")
  assert.ok(applied.appliedAt)

  const rolled = transitionChange({
    status: applied.status,
    action: "rollback",
    actor,
  })
  assert.equal(rolled.status, "rolled_back")
})

test("change state machine refuses illegal jumps", () => {
  assert.throws(
    () => transitionChange({ status: "draft", action: "apply", actor }),
    ChangeTransitionError
  )
  assert.throws(
    () => transitionChange({ status: "rolled_back", action: "approve", actor }),
    ChangeTransitionError
  )
})
