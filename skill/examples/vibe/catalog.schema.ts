/**
 * A2UI catalog SCHEMA for monday.com Vibe — no React, no styles.
 * Standard A2UI names reuse the official basic-catalog schemas; Vibe-specific
 * components (Label, AttentionBox, Table, Toggle) are extensions.
 */
import { z } from "zod";
import { CommonSchemas } from "@a2ui/web_core/v0_9";
import {
  RowApi,
  ColumnApi,
  TextApi,
  CardApi,
  ButtonApi,
  TextFieldApi,
  CheckBoxApi,
  TabsApi,
  DividerApi,
} from "@a2ui/web_core/v0_9/basic_catalog";

export const CATALOG_ID = "urn:storybook-a2ui:vibe:v1";

export const LabelApi = {
  name: "Label",
  schema: z
    .object({
      text: CommonSchemas.DynamicString.describe(
        "Short status or category text.",
      ),
      color: z
        .enum([
          "primary",
          "positive",
          "negative",
          "dark",
          "working_orange",
          "purple",
          "american_gray",
        ])
        .optional()
        .describe(
          "positive=good/done, negative=problem, working_orange=in progress, primary=info, american_gray=neutral.",
        ),
      kind: z
        .enum(["fill", "line"])
        .optional()
        .describe("fill for strong status, line for subtle metadata."),
    })
    .strict()
    .describe("A small, non-interactive status/category label."),
};

export const AttentionBoxApi = {
  name: "AttentionBox",
  schema: z
    .object({
      type: z
        .enum(["primary", "positive", "negative", "warning", "neutral"])
        .describe("Severity/tone."),
      title: CommonSchemas.DynamicString.optional().describe(
        "Bold lead-in, a few words.",
      ),
      text: CommonSchemas.DynamicString.describe("One or two sentences."),
    })
    .strict()
    .describe(
      "An inline message box. Use for empty states, errors, confirmations and summaries — not for layout.",
    ),
};

export const TableApi = {
  name: "Table",
  schema: z
    .object({
      columns: z
        .array(z.object({ key: z.string(), title: z.string() }).strict())
        .min(1)
        .describe("Columns. `key` is the field name on each row object."),
      rows: CommonSchemas.DynamicValue.describe(
        'Bind to an array of row objects, e.g. {"path": "/items"}. Each row needs an `id`.',
      ),
    })
    .strict()
    .describe(
      "Tabular view for many records with the same fields. Prefer over repeated Cards when there are more than ~6 items.",
    ),
};

export const ToggleApi = {
  name: "Toggle",
  schema: z
    .object({
      label: CommonSchemas.DynamicString.describe(
        "What the switch turns on or off.",
      ),
      value: CommonSchemas.DynamicValue.describe(
        'Boolean, usually bound: {"path": "/settings/x"}.',
      ),
    })
    .strict()
    .describe(
      "An on/off switch for a setting that applies immediately. Prefer over CheckBox for settings.",
    ),
};

export const CATALOG_APIS = [
  RowApi,
  ColumnApi,
  TextApi,
  CardApi,
  ButtonApi,
  TextFieldApi,
  CheckBoxApi,
  TabsApi,
  DividerApi,
  LabelApi,
  AttentionBoxApi,
  TableApi,
  ToggleApi,
];

// ── Coverage metadata (read by `a2ui.mjs coverage`) ─────────────────────────
export const CATALOG_SOURCES = {
  Row: { kind: 'ds', component: 'Flex' },
  Column: { kind: 'ds', component: 'Flex' },
  Text: { kind: 'ds', component: ['Heading', 'Text'], note: 'Vibe Heading has h1–h3 only; h4/h5 are bold Text' },
  Card: { kind: 'ds', component: 'Box', note: 'Vibe has no Card; bordered, rounded Box' },
  Button: { kind: 'ds', component: 'Button' },
  TextField: { kind: 'ds', component: 'TextField' },
  CheckBox: { kind: 'ds', component: 'Checkbox' },
  Tabs: { kind: 'ds', component: 'TabsContext' },
  Divider: { kind: 'ds', component: 'Divider' },
  Label: { kind: 'ds', component: 'Label' },
  AttentionBox: { kind: 'ds', component: 'AttentionBox' },
  Table: { kind: 'ds', component: 'Table' },
  Toggle: { kind: 'ds', component: 'Toggle' },
};

export const CATALOG_EXCLUDED = {
  Dropdown: 'not needed yet — add when a scenario needs a Select (agent wanted one)',
};

export const CATALOG_LIMITATIONS = [
  'Label color cannot be derived from data (A2UI v0.9) → add a semantic StatusLabel(status)',
  'Table is display-only: no sorting, selection or pagination',
  'Row/Column `weight` is not implemented in this example catalog — see catalog-recipe §3 for the weighted() helper',
];
