/**
 * A2UI catalog SCHEMA for Carbon — no React, no styles.
 *
 * Single source of truth for "what an agent may render". Imported by:
 *   - catalog.tsx        (binds each API to a real Carbon component)
 *   - the skill validator (checks agent output against these schemas in Node)
 *
 * Standard A2UI names (Row, Column, Text, Card, Button, TextField, CheckBox,
 * Tabs, Divider) reuse the OFFICIAL basic-catalog schemas, so any agent that
 * already speaks A2UI works unchanged — they just render as Carbon.
 * DS-specific components (Tag, Notification, DataTable) are extensions.
 */
import { z } from 'zod';
import { CommonSchemas as A2uiSchemas } from '@a2ui/web_core/v0_9';
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
} from '@a2ui/web_core/v0_9/basic_catalog';

/**
 * `@a2ui/web_core` may ship its own nested zod copy. Mixing its schemas into this
 * file's `z.object` makes TypeScript's types explode (TS2589). Re-type the few
 * shared schemas against OUR zod — the runtime objects are unchanged.
 */
type Binding = { path: string };
const CommonSchemas = A2uiSchemas as unknown as {
  DynamicString: z.ZodType<string | Binding>;
  DynamicValue: z.ZodType<unknown>;
};

export const CATALOG_ID = 'urn:storybook-a2ui:carbon:v1';

export const TagApi = {
  name: 'Tag',
  schema: z
    .object({
      text: CommonSchemas.DynamicString.describe(
        'Short label shown in the tag.'
      ),
      type: z
        .enum([
          'red',
          'magenta',
          'purple',
          'blue',
          'cyan',
          'teal',
          'green',
          'gray',
          'cool-gray',
          'warm-gray',
          'high-contrast',
          'outline',
        ])
        .optional()
        .describe(
          'Color family. Use semantically: green=positive, red=negative, blue=info, gray=neutral.'
        ),
    })
    .strict()
    .describe('A small, non-interactive label for status or category.'),
};

export const NotificationApi = {
  name: 'Notification',
  schema: z
    .object({
      kind: z
        .enum(['error', 'info', 'success', 'warning'])
        .describe('Severity of the message.'),
      title: CommonSchemas.DynamicString.describe('Bold lead-in, a few words.'),
      subtitle: CommonSchemas.DynamicString.optional().describe(
        'One sentence of detail.'
      ),
    })
    .strict()
    .describe(
      'An inline status message. Use for empty states, errors and confirmations — not for layout.'
    ),
};

export const DataTableApi = {
  name: 'DataTable',
  schema: z
    .object({
      title: CommonSchemas.DynamicString.optional(),
      headers: z
        .array(z.object({ key: z.string(), header: z.string() }).strict())
        .min(1)
        .describe('Columns. `key` is the field name on each row object.'),
      rows: CommonSchemas.DynamicValue.describe(
        'Bind to an array of row objects, e.g. {"path": "/flights"}. Each row needs an `id`.'
      ),
    })
    .strict()
    .describe(
      'A tabular view of many records with the same fields. Prefer over a List of Cards when there are more than ~6 items or items are compared column-by-column.'
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
  TagApi,
  NotificationApi,
  DataTableApi,
];

// ── Coverage metadata (read by `a2ui.mjs coverage`) ─────────────────────────
/** Which DS component backs each catalog entry. `tokens` = built from CSS/tokens, not a DS component. */
export const CATALOG_SOURCES = {
  Row: { kind: 'ds', component: 'Stack' },
  Column: { kind: 'ds', component: 'Stack' },
  Text: { kind: 'ds', component: 'Heading', note: 'body/caption via cds type classes' },
  Card: { kind: 'ds', component: 'Tile' },
  Button: { kind: 'ds', component: 'Button' },
  TextField: { kind: 'ds', component: 'TextInput' },
  CheckBox: { kind: 'ds', component: 'Checkbox' },
  Tabs: { kind: 'ds', component: 'Tabs' },
  Divider: { kind: 'tokens', note: '<hr> with --cds-border-subtle; Carbon has no divider' },
  Tag: { kind: 'ds', component: 'Tag' },
  Notification: { kind: 'ds', component: 'Notification' },
  DataTable: { kind: 'ds', component: 'DataTable' },
};

/** DS components deliberately NOT offered to the agent, with the reason. */
export const CATALOG_EXCLUDED = {
  Modal: 'overlays are out of scope for the v1 playground',
  ComposedModal: 'overlays are out of scope for the v1 playground',
  Tooltip: 'hover-only content; agents should not hide information in tooltips',
  UIShell: 'app chrome, not surface content',
};

/** Things the agent cannot express with this catalog — manual work for the team. */
export const CATALOG_LIMITATIONS = [
  'Tag color cannot be derived from data (A2UI v0.9 has no value→enum mapping) → add a semantic StatusTag(status)',
  'Row/Column `weight` (flex-grow) is ignored: Carbon Stack is CSS grid',
  'DataTable is display-only: no sorting, selection or pagination',
];
