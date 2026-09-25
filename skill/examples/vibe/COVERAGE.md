# A2UI catalog coverage

Catalog `urn:storybook-a2ui:vibe:v1` · 4 runs

**5 design-system components in Storybook · 4 offered to the agent · 1 not offered · 0 catalog entries are NOT real DS components**

## 1. Catalog → design system

| A2UI name | Backed by | Used in runs |
|---|---|---|
| Row | DS `Flex` — ⚠ Flex has no story in this Storybook | 3 |
| Column | DS `Flex` — ⚠ Flex has no story in this Storybook | 8 |
| Text | DS `Heading, Text` — ⚠ Heading, Text have no story in this Storybook | 14 |
| Card | DS `Box` — ⚠ Box has no story in this Storybook | 1 |
| Button | DS `Button` | 6 |
| TextField | DS `TextField` | 3 |
| CheckBox | DS `Checkbox` | 1 |
| Tabs | DS `TabsContext` — ⚠ TabsContext has no story in this Storybook | 1 |
| Divider | DS `Divider` — ⚠ Divider has no story in this Storybook | — never |
| Label | DS `Label` — ⚠ Label has no story in this Storybook | 2 |
| AttentionBox | DS `AttentionBox` — ⚠ AttentionBox has no story in this Storybook | 3 |
| Table | DS `Table` — ⚠ Table has no story in this Storybook | 1 |
| Toggle | DS `Toggle` | 1 |

## 2. Design-system components the agent was NOT offered

| Component | Agent wanted it | Status | Action |
|---|---|---|---|
| Dropdown |  | excluded: not needed yet — add when a scenario needs a Select (agent wanted one) | — |

## 3. What the agent wanted but could not use

| Wanted | × | Verdict | Action |
|---|---|---|---|
| Select (to change plan) | 1 | no component with this name in this Storybook | check for a synonym (e.g. Select ↔ Dropdown); if none, it is a DS gap |
| Pagination | 1 | no component with this name in this Storybook | check for a synonym (e.g. Select ↔ Dropdown); if none, it is a DS gap |
| sortable Table columns | 1 | capability gap in catalog component Table | extend Table or add a semantic component |
| row selection in Table | 1 | capability gap in catalog component Table | extend Table or add a semantic component |

## 4. Known limitations (manual work)

- ⚠ Label color cannot be derived from data (A2UI v0.9) → add a semantic StatusLabel(status)
- ⚠ Table is display-only: no sorting, selection or pagination

## Next actions

- **Extend a catalog component** (capability gap): sortable Table columns; row selection in Table
- **Possible DS gaps** (no component by that name — check synonyms first): Select (to change plan); Pagination
