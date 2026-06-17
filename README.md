> **Vortex DSE formal surface** · [Proofs (default + TLAPS)](https://github.com/vasilisnasopoulos-stack/vortex-dse-cslot-proofs) · [Strict spec + TLC](https://github.com/vasilisnasopoulos-stack/vortex-dse-cslot-spec) · [Merkle agreement](https://github.com/vasilisnasopoulos-stack/vortex-merkle-agreement) · [Profile](https://github.com/vasilisnasopoulos-stack)
>
> Production C engine is **not** public. This repo is the **strict** admission variant (`tx.cslot = current_slot`) + TLC/JS ref — not the default running model (see proofs repo).

> **Vortex public research bundle**
>
> This repository is one part of the public Vortex DSE verification bundle.
>
> [Spec](https://github.com/vasilisnasopoulos-stack/vortex-dse-cslot-spec) · [Proofs](https://github.com/vasilisnasopoulos-stack/vortex-dse-cslot-proofs) · [Merkle Agreement](https://github.com/vasilisnasopoulos-stack/vortex-merkle-agreement)

# Vortex DSE — C-Slot Strict Admission

Formal specification and executable reference implementation for the **strict** C-slot admission rule used as one public Vortex DSE verification artifact.

**Author:** Vasilis Nasopoulos
**Status:** machine-checked with TLC explicit-state model checking, Apalache symbolic/SMT checking, and executable reference scenarios
**Scope:** C-slot admission only. Network transport, production ticker internals, finality, benchmark internals, and full end-to-end protocol composition are outside this repository.

## Position in the public verification bundle

| Repository | Role | Verification status |
|---|---|---|
| [vortex-dse-cslot-proofs](https://github.com/vasilisnasopoulos-stack/vortex-dse-cslot-proofs) | Late-tolerant C-slot admission; deductive safety proofs | TLAPS: `[]TypeInvariant`, `[]NoFutureAdmission`; all 194 obligations proved |
| **vortex-dse-cslot-spec** ← you are here | Strict C-slot admission, clock skew, Byzantine timestamp/origin spoofing, executable reference | TLC + Apalache bounded checks; JavaScript reference scenarios |
| [vortex-merkle-agreement](https://github.com/vasilisnasopoulos-stack/vortex-merkle-agreement) | Per-slot input-set agreement: Freeze → Reconcile → Commit | TLC + Apalache bounded checks under declared assumptions |

## Strict vs late-tolerant admission

This repository specifies the **strict** C-slot rule:

```text
admit(tx, node) ⇔ tx.cslot = node.current_slot
```

Meaning:

- on-time transaction → admitted;
- one bucket late → permanently rejected;
- future-dated transaction → permanently rejected.

The default late-tolerant admission model is different:

```text
admit(tx, node) ⇔ tx.cslot <= node.current_slot
```

The late-tolerant model admits late messages into their original earlier slot and is deductively proved in the companion TLAPS repository. The results in this repository are **bounded model-checking results**, not unbounded deductive theorems.

## What this is

The C-slot rule is a deterministic **local admission predicate**. It is not, by itself, consensus.

```text
C_slot(tx) = floor((T_hw - T_0) / Delta_t)
```

The rule decides whether a node may locally process a transaction for its current temporal bucket. There is no leader, no quorum, and no voting in this admission layer.

## What this repository contains

```text
specs/
  Vortex_DSE_CSlot.tla         Safety + liveness spec (TLA+)
  Vortex_DSE_CSlot_Skew.tla    Adversarial extension: per-node clock + Byzantine origin spoofing
  *.cfg                        TLC model configurations
logs/
  tlc_cslot_tiny.log           Safety run output
  tlc_cslot_liveness.log       Liveness run output
  tlc_cslot_skew.log           Adversarial run output
ref_impl/
  cslot_ref.mjs                Executable JavaScript port of the spec
  run.log                      10/10 scenario suite output
STATUS.md                      Summary of properties checked
```

## Claims matrix

| Claim | Status | Method | Scope |
|---|---|---|---|
| Strict same-slot admission | Checked | TLC + Apalache | Configured finite instances |
| Exactly once per node | Checked | TLC | Configured finite instances |
| Persistent snapshot does not invent ids | Checked | TLC | Configured finite instances |
| No phantom process | Checked | TLC | Configured finite instances |
| Decision locality only | Checked | TLC | Configured finite instances |
| No late admission | Checked | TLC | Configured finite instances |
| No future admission | Checked | TLC | Configured finite instances |
| Clock skew tolerance | Checked | TLC | Bounded per-node drift |
| Byzantine timestamp origin | Checked | TLC | Spoofed origin rejected |
| Cross-slot replay | Checked | TLC | Re-admission rejected |
| Model coverage | 100% | TLC | All states reached |
| Full end-to-end consensus | **Out of scope** | — | Requires agreement + finality layers |

## Reproduce

### TLC

Requires `tla2tools.jar`.

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

Requires Node.js 18+ and has no dependencies.

```sh
node ref_impl/cslot_ref.mjs
```

## Suggested reviewer path

1. Start with the claims matrix above.
2. Inspect `specs/Vortex_DSE_CSlot.tla` for the strict admission transition system.
3. Inspect `specs/Vortex_DSE_CSlot_Skew.tla` for the adversarial clock/origin model.
4. Run the TLC configurations and compare against `logs/`.
5. Run the JavaScript reference scenarios.
6. Continue to `vortex-dse-cslot-proofs` for deductive TLAPS safety proofs of the late-tolerant admission variant.
7. Continue to `vortex-merkle-agreement` for the per-slot input-set agreement layer.

## Porting to other proof assistants

The specification is intentionally small and uses simple TLA+ structures. It is suitable for ports to Lean 4, Coq, Isabelle/HOL, or another theorem prover. The JavaScript reference implementation can serve as a behavioral oracle for accept/reject decisions.

## License

Apache License 2.0. See `LICENSE`.

The formal specification and reference implementation are released for academic and engineering review. Production implementation details remain outside this repository.
