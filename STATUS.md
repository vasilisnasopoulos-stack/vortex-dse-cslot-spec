# Vortex DSE — C-Slot Verification Status

**As of 2026-05-21**

## Scope of this repository

C-slot strict admission rule only. Other components of Vortex DSE
(production implementation, network layer, benchmark harness) are
out of scope and not part of this repository.

## Verification methods used

- **TLC** (explicit-state, breadth-first model checking)
- **Reference implementation** (executable JavaScript port of the spec)

Apalache harness for the Skew spec is **not shipped in this repo** — see Open / next.

## Results

### 1. Safety (TLC, explicit-state)

Spec: `specs/Vortex_DSE_CSlot.tla` · Config: `specs/Vortex_DSE_CSlot_tiny.cfg`
Scope: 2 nodes, 2 messages, MaxSlot = 4. Exhaustive state-space exploration.

- 8,084,795 states generated · 608,477 distinct · depth 23 · 38s · **0 errors**
- 7 invariants verified: `TypeInvariant`, `ExactlyOncePerNode`,
  `CSlotStrictAdmission`, `PersistedReflectsReality`, `NoPhantomProcess`,
  `DecisionLocalityOnly`, `NoLateAdmission`

Log: `logs/tlc_cslot_tiny.log`.

### 2. Liveness (TLC, temporal)

Spec: `specs/Vortex_DSE_CSlot.tla` (LiveSpec) · Config: `specs/Vortex_DSE_CSlot_liveness.cfg`
Scope: 2 nodes, 1 message, MaxSlot = 2.

Fairness assignment:

    LiveSpec = Spec /\ SF_vars(Tick) /\ \A n \in Nodes : WF_vars(Rejoin(n))

- 2,672 states · 453 distinct · depth 12 · 2s · **0 errors**
- L1 `TickProgress` — `<>(current_slot = MaxSlot)` ✓
- L2 `EventualRejoin` — `(node_state[n] = "down") ~> (node_state[n] = "up")` ✓

`WF(Process)` is intentionally **not** asserted: the strict slot rule
allows late deliveries to be dropped permanently. That is the feature.

Log: `logs/tlc_cslot_liveness.log`.

### 3. Adversarial extension (TLC)

Spec: `specs/Vortex_DSE_CSlot_Skew.tla` · Config: `specs/Vortex_DSE_CSlot_Skew_tiny.cfg`
Scope: 2 nodes, 1 message, MaxSlot = 2, MaxSkew = 1.

Extensions over the baseline:
- Per-node clock `node_slot[n]` (replaces the global `current_slot`)
- `SkewedTick(n)` advances one node's clock under the structural
  constraint `(node_slot[n] + 1) - node_slot[other] <= MaxSkew`
- `ByzantineInject(id, fake_cslot, fake_origin)` lets the adversary
  spoof both the timestamp and the sender identity

Results:
- 96,481 states · 10,099 distinct · depth 17 · 2s · **0 errors**
- 6 invariants hold: `TypeInvariant`, `BoundedSkew`, `ExactlyOncePerNode`,
  `CSlotLocalAdmission`, `PersistedReflectsReality`, `NoPhantomProcess`

Log: `logs/tlc_cslot_skew.log`.

### 4. Reference implementation (JavaScript)

`ref_impl/cslot_ref.mjs` is a direct executable port of the safety spec.
Running it executes 10 deterministic scenarios:

S1_ontime, S2_one_slot_late, S3_future_dated, S4_duplicate_same_node,
S5_same_slot_two_nodes, S6_crash_rejoin_preserves, S7_no_double_after_rejoin,
S8_replay_past_cslot, S9_future_injection_waits_then_admits, S10_down_node_rejects

Result: **10/10 PASS**. See `ref_impl/run.log`.

## Open / next

- Lean / Coq / Isabelle ports
- Apalache run on the Skew spec (symbolic, requires annotations)
- Larger scope for Skew (3 nodes, MaxSlot=4, MaxSkew=2) — likely state
  explosion, would need state constraints
