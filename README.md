# Vortex DSE — C-Slot Strict Admission

Formal specification and reference implementation for the C-slot admission rule
used in Vortex DSE.

**Author**: Vasilis Nasopoulos
**Status**: machine-checked (TLC explicit-state + Apalache symbolic SMT + executable reference)
**Scope**: C-slot admission only. Other Vortex DSE components (network layer,
production implementation, benchmark internals) are out of scope of this repo.

---

## What this is

The C-slot rule, in one line:

> A transaction stamped for temporal bucket `k` is admissible at a node iff
> the node's local ticker is currently in bucket `k`. One bucket late → permanent
> reject. Future-dated → permanent reject. No leader, no quorum, no vote.

This is **not** a TTL window, **not** consensus. It is a local, deterministic
admission predicate at each node.

Formally:

```
C_slot(tx) = floor( (T_hw - T_0) / Delta_t )

admit(tx, node) ⟺ tx.cslot = node.current_slot
```

## What this repo contains

```
specs/
  Vortex_DSE_CSlot.tla         Safety + liveness spec (TLA+)
  Vortex_DSE_CSlot_Skew.tla    Adversarial extension: per-node clock + Byzantine origin spoofing
  *.cfg                        TLC model configurations
logs/
  tlc_cslot_tiny.log           Safety run output
  tlc_cslot_liveness.log       Liveness run output
  tlc_cslot_skew.log           Adversarial run output
ref_impl/
  cslot_ref.mjs                Executable port of the spec in JavaScript
  run.log                      10/10 scenario suite output
STATUS.md                      Summary of properties checked
```

## What this repo deliberately does NOT contain

- The production C ticker implementation (proprietary).
- Network / P2P / gossip layer specs.
- Benchmark harness or performance measurement code.
- Other Vortex DSE modules (convergence layer, finality, crypto bindings).

The artifacts here are sufficient to reproduce the formal results and to port
the spec to other proof assistants (Lean, Coq, Isabelle, etc.). They are not
sufficient to reproduce the production performance characteristics, which
depend on implementation details kept out of scope.

---

## Results

### 1. Safety (TLC, explicit-state)

Spec: `specs/Vortex_DSE_CSlot.tla` · Config: `specs/Vortex_DSE_CSlot_tiny.cfg`
Scope: 2 nodes, 2 messages, MaxSlot = 4. Full state space.

```
8,084,795 states generated · 608,477 distinct · 0 errors · depth 23
Finished in 38s.
```

7 invariants verified:
- `TypeInvariant`
- `CSlotStrictAdmission` — the headline rule
- `ExactlyOncePerNode`
- `PersistedReflectsReality` — mmap snapshot never invents
- `NoPhantomProcess`
- `DecisionLocalityOnly`
- `NoLateAdmission` — distinguishes from a TTL window

### 2. Liveness (TLC, temporal)

Spec: `specs/Vortex_DSE_CSlot.tla` (LiveSpec) · Config: `specs/Vortex_DSE_CSlot_liveness.cfg`
Scope: 2 nodes, 1 message, MaxSlot = 2.

```
LiveSpec = Spec ∧ SF(Tick) ∧ ∀n: WF(Rejoin(n))
```

```
2,672 states · 453 distinct · 0 errors · depth 12 · 2s
```

Properties:
- **L1 TickProgress** — `<>(current_slot = MaxSlot)`
- **L2 EventualRejoin** — `∀n: (node_state[n] = "down" → <>(node_state[n] = "up"))`

NOTE: there is intentionally **no** `WF(Process)`. The strict slot rule allows
late deliveries to be dropped permanently — that is a feature, not a bug.

### 3. Adversarial extension (TLC)

Spec: `specs/Vortex_DSE_CSlot_Skew.tla` · Config: `specs/Vortex_DSE_CSlot_Skew_tiny.cfg`
Scope: 2 nodes, 1 message, MaxSlot = 2, MaxSkew = 1.

Replaces the global clock with a per-node clock and adds:
- `SkewedTick(n)` — only one node's clock advances per step
- `BoundedSkew` invariant — `|node_slot[n1] − node_slot[n2]| ≤ MaxSkew`
- `ByzantineInject(id, fake_cslot, fake_origin)` — adversary spoofs **both**
  the timestamp and the sender identity

```
96,481 states · 10,099 distinct · 0 errors · depth 17 · 2s
```

6 invariants hold under skew + Byzantine origin spoofing:
- `TypeInvariant`
- `BoundedSkew`
- `ExactlyOncePerNode`
- `CSlotLocalAdmission`
- `PersistedReflectsReality`
- `NoPhantomProcess`

### 4. Reference implementation (JavaScript)

`ref_impl/cslot_ref.mjs` is a direct executable port of the TLA+ spec. Each
method mirrors one spec action. Running it executes 10 deterministic scenarios:

```
S1_ontime, S2_one_slot_late, S3_future_dated, S4_duplicate_same_node,
S5_same_slot_two_nodes, S6_crash_rejoin_preserves, S7_no_double_after_rejoin,
S8_replay_past_cslot, S9_future_injection_waits_then_admits, S10_down_node_rejects
```

```
$ node ref_impl/cslot_ref.mjs
10/10 scenarios passed, 0 failed
```

Purpose: a code-to-spec bridge. The production C ticker can later be
cross-checked against the same scenarios.

---

## Reproducing the results

### TLC

Requires `tla2tools.jar` (TLA+ Toolbox / community modules).

```sh
# Safety
java -jar tla2tools.jar -workers auto \
  -config specs/Vortex_DSE_CSlot_tiny.cfg \
  specs/Vortex_DSE_CSlot.tla

# Liveness
java -jar tla2tools.jar -workers auto \
  -config specs/Vortex_DSE_CSlot_liveness.cfg \
  specs/Vortex_DSE_CSlot.tla

# Adversarial
java -jar tla2tools.jar -workers auto \
  -config specs/Vortex_DSE_CSlot_Skew_tiny.cfg \
  specs/Vortex_DSE_CSlot_Skew.tla
```

### Reference implementation

```sh
node ref_impl/cslot_ref.mjs
```

Requires Node.js 18+. No dependencies.

---

## Porting to other proof assistants

The spec is small (~390 lines of TLA+ across two modules), uses only `Naturals`,
`FiniteSets`, and `Sequences`, and has no record types beyond plain functions.
This makes it well-suited to ports targeting:

- **Lean 4** — state-machine encoding + k-induction
- **Coq** — Iris or vanilla inductive relations
- **Isabelle/HOL** — locales

The reference implementation in `ref_impl/` doubles as a test oracle: any port
should produce the same accept/reject decisions for the 10 scenarios.

If you are working on such a port, the spec author is happy to clarify any
modeling decisions. Open an issue or reach out.

---

## License

Apache License 2.0. See `LICENSE`.

The formal specification and reference implementation are released for academic
and engineering review. The production implementation referenced by this spec
remains proprietary and is not part of this repository.

---

## Citation

If you use this spec in academic work, please cite:

```
@misc{nasopoulos2026vortexcslot,
  author = {Nasopoulos, Vasilis},
  title  = {Vortex DSE C-Slot Strict Admission: a deterministic,
            consensus-free admission rule under async + crashes + Byzantine origin spoofing},
  year   = {2026},
  howpublished = {\url{https://github.com/<handle>/vortex-dse-cslot-spec}}
}
```
