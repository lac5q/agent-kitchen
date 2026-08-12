# FORBIDDEN.md — Anti-Slop Pattern Guard

Catch and remove these patterns before text ships or is saved.

## Banned patterns

### 1. Staccato pairs
Chopped ultra-short sentence pairs for fake drama.
- Bad: `Simple design. Hard to break.`
- Fix: `The design is simple and hard to break.`

### 2. Antithesis reframe / negative parallelism
Contrast frames: "Not X, but Y", "It isn't A, it's B".
- Bad: `This is not just a tool, but a complete workflow transformation.`
- Fix: `This provides a complete workflow.`

### 3. Isocolon metaphor-pairs
Parallel rhythmic metaphor pairs for style, not meaning.
- Bad: `Lighthouses in the dark, compasses in the storm.`
- Fix: Name the concrete function in plain terms.

### 4. Backward-references
Meta pointers to earlier text: "as mentioned above", "as noted earlier", "more on that later".
- Bad: `As mentioned above, the system uses ASD-STE100.`
- Fix: `The system uses ASD-STE100.`

## Enforcement
1. Scan the draft for the patterns above before finalizing.
2. Rewrite with ASD-STE100 Simplified Technical English and Zinsser's four principles (simplicity, brevity, clarity, humanity).
3. Writer / long-form tasks: keep the active context under 50%. Call a subagent if the window grows past that.
