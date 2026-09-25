/**
 * A2UI catalog IMPLEMENTATION for Carbon — binds each schema in
 * catalog.schema.ts to a real Carbon component.
 */
import React, { useId } from 'react';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { Catalog, type ComponentApi } from '@a2ui/web_core/v0_9';
import {
  Stack,
  Tile,
  Button,
  TextInput,
  Checkbox,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Tag,
  InlineNotification,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Heading,
  Section,
} from '../index';
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
import {
  CATALOG_ID,
  TagApi,
  NotificationApi,
  DataTableApi,
} from './catalog.schema';

type ChildRef = string | { id: string; basePath?: string };
type BuildChild = (id: string, basePath?: string) => React.ReactNode;

/** Same child-list contract as the official renderer (string ref or template node). */
function renderChildren(children: unknown, buildChild: BuildChild) {
  if (!Array.isArray(children)) return null;
  return (children as ChildRef[]).map((ref, i) =>
    typeof ref === 'string' ? (
      <React.Fragment key={`${ref}-${i}`}>{buildChild(ref)}</React.Fragment>
    ) : (
      <React.Fragment key={`${ref.id}-${ref.basePath}`}>
        {buildChild(ref.id, ref.basePath)}
      </React.Fragment>
    )
  );
}

const JUSTIFY: Record<string, string> = {
  start: 'start',
  center: 'center',
  end: 'end',
  stretch: 'stretch',
  spaceBetween: 'space-between',
  spaceAround: 'space-around',
  spaceEvenly: 'space-evenly',
};

/**
 * Carbon Stack is CSS grid, not flex. Map A2UI's flex-style props onto grid:
 * horizontal → main axis = justify-content, cross = align-items;
 * vertical   → main axis = align-content,   cross = justify-items
 * (justify-content on a vertical grid would shrink the column to its content).
 */
function stackStyle(
  orientation: 'horizontal' | 'vertical',
  props: { justify?: string; align?: string }
) {
  const main = JUSTIFY[props.justify ?? 'start'];
  const cross = props.align ?? 'stretch';
  return orientation === 'horizontal'
    ? { width: '100%', justifyContent: main, alignItems: cross }
    : { width: '100%', alignContent: main, justifyItems: cross };
}

const Row = createComponentImplementation(RowApi, ({ props, buildChild }) => (
  <Stack
    orientation="horizontal"
    gap={5}
    style={stackStyle('horizontal', props)}>
    {renderChildren(props.children, buildChild)}
  </Stack>
));

const Column = createComponentImplementation(
  ColumnApi,
  ({ props, buildChild }) => (
    <Stack
      orientation="vertical"
      gap={5}
      style={stackStyle('vertical', props)}>
      {renderChildren(props.children, buildChild)}
    </Stack>
  )
);

const HEADING_LEVEL: Record<string, number> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
};

const Text = createComponentImplementation(TextApi, ({ props }) => {
  const level = HEADING_LEVEL[props.variant ?? 'body'];
  if (level) {
    return (
      <Section level={level as 1}>
        <Heading>{props.text}</Heading>
      </Section>
    );
  }
  const className =
    props.variant === 'caption'
      ? 'cds--type-helper-text-01'
      : 'cds--type-body-01';
  return <span className={className}>{props.text}</span>;
});

const Card = createComponentImplementation(CardApi, ({ props, buildChild }) => (
  <Tile>{props.child ? buildChild(props.child as string) : null}</Tile>
));

const BUTTON_KIND = {
  primary: 'primary',
  default: 'secondary',
  borderless: 'ghost',
} as const;

const ButtonImpl = createComponentImplementation(
  ButtonApi,
  ({ props, buildChild }) => (
    <div>
      <Button
        kind={BUTTON_KIND[props.variant ?? 'default']}
        disabled={props.isValid === false}
        onClick={() => (props.action as (() => void) | undefined)?.()}>
        {props.child ? buildChild(props.child as string) : null}
      </Button>
    </div>
  )
);

const TextField = createComponentImplementation(TextFieldApi, ({ props }) => {
  const id = useId();
  return (
    <TextInput
      id={id}
      labelText={props.label ?? ''}
      defaultValue={props.value ?? ''}
      type={
        props.variant === 'obscured'
          ? 'password'
          : props.variant === 'number'
            ? 'number'
            : 'text'
      }
      invalid={Boolean(props.validationErrors?.length)}
      invalidText={props.validationErrors?.[0]}
    />
  );
});

const CheckBox = createComponentImplementation(CheckBoxApi, ({ props }) => {
  const id = useId();
  return (
    <Checkbox
      id={id}
      labelText={props.label ?? ''}
      defaultChecked={Boolean(props.value)}
    />
  );
});

const TabsImpl = createComponentImplementation(
  TabsApi,
  ({ props, buildChild }) => (
    <Tabs>
      <TabList aria-label="tabs">
        {props.tabs.map((t, i) => (
          <Tab key={i}>{String(t.title)}</Tab>
        ))}
      </TabList>
      <TabPanels>
        {props.tabs.map((t, i) => (
          <TabPanel key={i}>{buildChild(t.child as string)}</TabPanel>
        ))}
      </TabPanels>
    </Tabs>
  )
);

const Divider = createComponentImplementation(DividerApi, () => (
  <hr
    style={{
      border: 0,
      borderTop: '1px solid var(--cds-border-subtle)',
      width: '100%',
      margin: 0,
    }}
  />
));

/**
 * Extensions use schemas built with THIS project's zod, which may be a different
 * copy than @a2ui's. Type their (already resolved) props explicitly instead of
 * letting createComponentImplementation infer across two zod copies (TS2589).
 */
function impl<P>(
  api: { name: string; schema: unknown },
  View: (args: { props: P; buildChild: BuildChild }) => React.ReactElement
) {
  return createComponentImplementation(
    api as unknown as ComponentApi,
    ({ props, buildChild }) => View({ props: props as unknown as P, buildChild })
  );
}

type TagType = 'red' | 'magenta' | 'purple' | 'blue' | 'cyan' | 'teal' | 'green' | 'gray' | 'cool-gray' | 'warm-gray' | 'high-contrast' | 'outline';

const TagImpl = impl<{ text: string; type?: TagType }>(TagApi, ({ props }) => (
  // Wrapper keeps the tag at its natural width inside a stretching Stack.
  <div>
    <Tag type={props.type ?? 'gray'}>{props.text}</Tag>
  </div>
));

const Notification = impl<{
  kind: 'error' | 'info' | 'success' | 'warning';
  title: string;
  subtitle?: string;
}>(NotificationApi, ({ props }) => (
  <InlineNotification
    kind={props.kind}
    title={props.title}
    subtitle={props.subtitle}
    hideCloseButton
    lowContrast
  />
));

type Row = Record<string, unknown> & { id?: string };

const DataTable = impl<{
  title?: string;
  headers: { key: string; header: string }[];
  rows: unknown;
}>(DataTableApi, ({ props }) => {
  const rows = (Array.isArray(props.rows) ? props.rows : []) as Row[];
  return (
    <Stack gap={3}>
      {props.title ? (
        <Section level={4}>
          <Heading>{props.title}</Heading>
        </Section>
      ) : null}
      <Table size="md" useZebraStyles>
        <TableHead>
          <TableRow>
            {props.headers.map((h) => (
              <TableHeader key={h.key}>{h.header}</TableHeader>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.id ?? i}>
              {props.headers.map((h) => (
                <TableCell key={h.key}>{String(r[h.key] ?? '')}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  );
});

export const catalog = new Catalog(CATALOG_ID, [
  Row,
  Column,
  Text,
  Card,
  ButtonImpl,
  TextField,
  CheckBox,
  TabsImpl,
  Divider,
  TagImpl,
  Notification,
  DataTable,
]);
