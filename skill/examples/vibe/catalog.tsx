/**
 * A2UI catalog IMPLEMENTATION for monday.com Vibe — binds each schema in
 * catalog.schema.ts to a real Vibe component.
 */
import React, { useId, useState } from "react";
import { createComponentImplementation } from "@a2ui/react/v0_9";
import { Catalog, type ComponentApi } from "@a2ui/web_core/v0_9";
import {
  Flex,
  Box,
  Heading,
  Text as VibeText,
  Button as VibeButton,
  TextField as VibeTextField,
  Checkbox,
  Toggle as VibeToggle,
  TabsContext,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Divider as VibeDivider,
  Label as VibeLabel,
  AttentionBox as VibeAttentionBox,
  Table as VibeTable,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from "@vibe/core";
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
import {
  CATALOG_ID,
  LabelApi,
  AttentionBoxApi,
  TableApi,
  ToggleApi,
} from "./catalog.schema";

type ChildRef = string | { id: string; basePath?: string };
type BuildChild = (id: string, basePath?: string) => React.ReactNode;

/** Same child-list contract as the official renderer (string ref or template node). */
function renderChildren(children: unknown, buildChild: BuildChild) {
  if (!Array.isArray(children)) return null;
  return (children as ChildRef[]).map((ref, i) =>
    typeof ref === "string" ? (
      <React.Fragment key={`${ref}-${i}`}>{buildChild(ref)}</React.Fragment>
    ) : (
      <React.Fragment key={`${ref.id}-${ref.basePath}`}>
        {buildChild(ref.id, ref.basePath)}
      </React.Fragment>
    ),
  );
}

// Vibe Flex is real flexbox, so A2UI justify/align map across directly.
const JUSTIFY = {
  start: "start",
  center: "center",
  end: "end",
  stretch: "start",
  spaceBetween: "space-between",
  spaceAround: "space-around",
  spaceEvenly: "space-around",
} as const;
type Justify = keyof typeof JUSTIFY;
type Align = "start" | "center" | "end" | "stretch";

const Row = createComponentImplementation(RowApi, ({ props, buildChild }) => (
  <Flex
    direction="row"
    gap={16}
    justify={JUSTIFY[(props.justify ?? "start") as Justify]}
    align={(props.align ?? "center") as Align}
    style={{ width: "100%" }}
  >
    {renderChildren(props.children, buildChild)}
  </Flex>
));

const Column = createComponentImplementation(
  ColumnApi,
  ({ props, buildChild }) => (
    <Flex
      direction="column"
      gap={16}
      justify={JUSTIFY[(props.justify ?? "start") as Justify]}
      align={(props.align ?? "stretch") as Align}
      style={{ width: "100%" }}
    >
      {renderChildren(props.children, buildChild)}
    </Flex>
  ),
);

const Text = createComponentImplementation(TextApi, ({ props }) => {
  const text = String(props.text ?? "");
  switch (props.variant) {
    case "h1":
    case "h2":
    case "h3":
      return <Heading type={props.variant} ellipsis={false}>{text}</Heading>;
    case "h4":
      return (
        <VibeText type="text1" weight="bold" color="inherit" ellipsis={false}>
          {text}
        </VibeText>
      );
    case "h5":
      return (
        <VibeText type="text2" weight="bold" color="inherit" ellipsis={false}>
          {text}
        </VibeText>
      );
    case "caption":
      return (
        <VibeText type="text3" color="secondary" ellipsis={false}>
          {text}
        </VibeText>
      );
    default:
      // color=inherit so text inside a Button takes the button's own text color.
      return <VibeText type="text2" color="inherit" ellipsis={false}>{text}</VibeText>;
  }
});

// Vibe has no Card: a bordered, rounded Box is its card surface.
const Card = createComponentImplementation(CardApi, ({ props, buildChild }) => (
  <Box
    border
    rounded="medium"
    padding="large"
    style={{ width: "100%", boxSizing: "border-box" }}
  >
    {props.child ? buildChild(props.child as string) : null}
  </Box>
));

const BUTTON_KIND = {
  primary: "primary",
  default: "secondary",
  borderless: "tertiary",
} as const;

const Button = createComponentImplementation(
  ButtonApi,
  ({ props, buildChild }) => (
    <div>
      <VibeButton
        kind={BUTTON_KIND[props.variant ?? "default"]}
        disabled={props.isValid === false}
        onClick={() => (props.action as (() => void) | undefined)?.()}
      >
        {props.child ? buildChild(props.child as string) : null}
      </VibeButton>
    </div>
  ),
);

const TextField = createComponentImplementation(TextFieldApi, ({ props }) => {
  const [value, setValue] = useState(String(props.value ?? ""));
  return (
    <VibeTextField
      title={String(props.label ?? "")}
      value={value}
      onChange={(v: string) => setValue(v)}
      type={
        props.variant === "obscured"
          ? "password"
          : props.variant === "number"
            ? "number"
            : "text"
      }
      size="medium"
    />
  );
});

const CheckBox = createComponentImplementation(CheckBoxApi, ({ props }) => {
  const [checked, setChecked] = useState(Boolean(props.value));
  return (
    <Checkbox
      label={String(props.label ?? "")}
      checked={checked}
      onChange={() => setChecked((c) => !c)}
    />
  );
});

const Tabs = createComponentImplementation(TabsApi, ({ props, buildChild }) => {
  const id = useId();
  return (
    <TabsContext id={id}>
      <TabList>
        {props.tabs.map((t, i) => (
          <Tab key={i}>{String(t.title)}</Tab>
        ))}
      </TabList>
      <TabPanels>
        {props.tabs.map((t, i) => (
          <TabPanel key={i}>
            <div style={{ paddingTop: 16 }}>
              {buildChild(t.child as string)}
            </div>
          </TabPanel>
        ))}
      </TabPanels>
    </TabsContext>
  );
});

const Divider = createComponentImplementation(DividerApi, ({ props }) => (
  <VibeDivider
    direction={props.axis === "vertical" ? "vertical" : "horizontal"}
  />
));

/**
 * Extensions: type their (already resolved) props explicitly — robust even when
 * @a2ui ships a different zod copy than the project (see catalog-recipe §5).
 */
function impl<P>(
  api: { name: string; schema: unknown },
  View: (args: { props: P; buildChild: BuildChild }) => React.ReactElement,
) {
  return createComponentImplementation(
    api as unknown as ComponentApi,
    ({ props, buildChild }) =>
      View({ props: props as unknown as P, buildChild }),
  );
}

type LabelColor =
  | "primary"
  | "positive"
  | "negative"
  | "dark"
  | "working_orange"
  | "purple"
  | "american_gray";

const Label = impl<{
  text: string;
  color?: LabelColor;
  kind?: "fill" | "line";
}>(LabelApi, ({ props }) => (
  <div>
    <VibeLabel
      text={props.text}
      color={props.color ?? "primary"}
      kind={props.kind ?? "fill"}
    />
  </div>
));

const AttentionBox = impl<{
  type: "primary" | "positive" | "negative" | "warning" | "neutral";
  title?: string;
  text: string;
}>(AttentionBoxApi, ({ props }) => (
  <VibeAttentionBox type={props.type} title={props.title} text={props.text} />
));

type RowData = Record<string, unknown> & { id?: string };

const Table = impl<{
  columns: { key: string; title: string }[];
  rows: unknown;
}>(TableApi, ({ props }) => {
  const rows = (Array.isArray(props.rows) ? props.rows : []) as RowData[];
  const columns = props.columns.map((c) => ({ id: c.key, title: c.title }));
  return (
    <VibeTable
      columns={columns}
      emptyState={<VibeText type="text2">No rows</VibeText>}
      errorState={<VibeText type="text2">Could not load rows</VibeText>}
    >
      <TableHeader>
        {columns.map((c) => (
          <TableHeaderCell key={c.id} title={c.title} />
        ))}
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={r.id ?? i}>
            {columns.map((c) => (
              <TableCell key={c.id}>{String(r[c.id] ?? "")}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </VibeTable>
  );
});

const Toggle = impl<{ label: string; value: unknown }>(
  ToggleApi,
  ({ props }) => {
    const [on, setOn] = useState(Boolean(props.value));
    return (
      <Flex gap={8} align="center">
        <VibeToggle isSelected={on} onChange={(v: boolean) => setOn(v)} areLabelsHidden aria-label={props.label} />
        <VibeText type="text2">{props.label}</VibeText>
      </Flex>
    );
  },
);

export const catalog = new Catalog(CATALOG_ID, [
  Row,
  Column,
  Text,
  Card,
  Button,
  TextField,
  CheckBox,
  Tabs,
  Divider,
  Label,
  AttentionBox,
  Table,
  Toggle,
]);
