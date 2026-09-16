import type { Actor, ChangeAction, ChangeStatus } from "./types.ts"

export class ChangeTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ChangeTransitionError"
  }
}

export type ChangeTransition = {
  status: ChangeStatus
  action: ChangeAction
  approvedByEmail: string | null
  approvedAt: Date | null
  appliedAt: Date | null
  event: {
    action: ChangeAction
    detail: Record<string, unknown>
  }
}

const allowed: Record<ChangeStatus, Partial<Record<ChangeAction, ChangeStatus>>> = {
  draft: { submit: "pending_approval" },
  pending_approval: { approve: "approved", reject: "rejected" },
  approved: { apply: "applied", reject: "rejected" },
  applied: { rollback: "rolled_back" },
  rejected: {},
  rolled_back: {},
}

export function transitionChange(input: {
  status: ChangeStatus
  action: ChangeAction
  actor: Actor
  now?: Date
  lockhavenAccessRequestId?: string | null
}): ChangeTransition {
  const next = allowed[input.status][input.action]
  if (!next) {
    throw new ChangeTransitionError(
      `Cannot ${input.action} a change that is ${input.status}`
    )
  }

  const now = input.now ?? new Date()
  const usesAccessApproval =
    input.action === "approve" && Boolean(input.lockhavenAccessRequestId)

  return {
    status: next,
    action: input.action,
    approvedByEmail:
      input.action === "approve" ? input.actor.email : null,
    approvedAt: input.action === "approve" ? now : null,
    appliedAt: input.action === "apply" ? now : null,
    event: {
      action: input.action,
      detail: {
        from: input.status,
        to: next,
        actorSub: input.actor.sub,
        lockhavenAccessRequestId: input.lockhavenAccessRequestId ?? null,
        reusedAccessApproval: usesAccessApproval,
      },
    },
  }
}
