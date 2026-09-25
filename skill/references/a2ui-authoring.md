# Authoring A2UI v0.9 runs

A **run** is one agent answer: a prompt + one dataset → an A2UI message stream.
File: `runs/<scenario>--<dataset>.json`

```json
{
  "prompt": "Show the cheapest flight options and let the user pick one.",
  "dataset": "few",
  "wanted": ["Pagination"],
  "messages": [
    { "version": "v0.9", "createSurface": { "surfaceId": "flights", "catalogId": "<CATALOG_ID from catalog.schema.ts>" } },
    { "version": "v0.9", "updateComponents": { "surfaceId": "flights", "components": [ ... ] } },
    { "version": "v0.9", "updateDataModel": { "surfaceId": "flights", "path": "/", "value": { ...dataset file contents... } } }
  ]
}
```

- `wanted` — components you reached for but the catalog does not have. **Start each entry with a PascalCase
  component name** so the coverage report can match it: `"Icon"`, `"Select (to change plan)"`,
  `"Badge color from status"` (a capability gap in an existing component). If you know the DS has it under
  another name, use that name: `"Dropdown (as a select)"`. Be honest: this
  list is the product's gap report. Never fake a missing component with a hack.
- `updateDataModel.value` — paste the dataset file verbatim; bind to it, do not copy
  values into components.

## Components are a flat list

Each entry is `{ "id": "...", "component": "<CatalogName>", ...props }`.

- Exactly one component has `"id": "root"`.
- Children are **referenced by id**, never inlined:
  - single child: `"child": "body"`
  - fixed list: `"children": ["title", "summary", "list"]`
  - repeat over data (template): `"children": { "path": "/flights", "componentId": "card" }`
- Every referenced id must exist; every component should be reachable from `root`.
- Props not listed by `describe` are rejected (schemas are strict).

## Data binding (JSON Pointer)

- Literal: `"text": "Select"`
- Absolute: `"text": { "path": "/route" }`
- Relative, inside a template: `"text": { "path": "airline" }` → `/flights/0/airline`, `/flights/1/airline`, …
- Actions carry context from data:
  `"action": { "event": { "name": "selectFlight", "context": { "flightId": { "path": "id" } } } }`

## Choosing UI per dataset (the point of the playground)

Author each dataset separately, the way a real agent would after seeing the data:

| Data shape                 | Good answer                                               |
| -------------------------- | --------------------------------------------------------- |
| empty list                 | status message + a recovery action (no empty container)   |
| few items (≤ 6)            | cards/rows with the key facts and one primary action each |
| many items (≥ 7)           | a table (`preferTable` guardrail warns otherwise)         |
| form-like record           | inputs bound to the record + one primary save per section |
| long text / missing fields | still readable; do not bind to fields that are absent     |

## Common mistakes the checker catches

unknown component · unknown prop · bad enum value · missing `root` · dangling
child id · cycle · orphan · binding to a path that resolves to nothing ·
template path that is not an array · guardrail violations.
