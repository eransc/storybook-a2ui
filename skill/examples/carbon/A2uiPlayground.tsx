/**
 * Renders an A2UI v0.9 message stream with the Carbon catalog.
 * One processor per message list, so each story is isolated.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { A2uiSurface } from '@a2ui/react/v0_9';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import { catalog } from './catalog';

export interface A2uiRun {
  prompt: string;
  dataset: string;
  messages: unknown[];
  /** Components the agent wanted but the catalog lacks (agent-reported). */
  wanted?: string[];
}

/** Small caption so a screenshot explains itself: prompt, dataset, gaps. */
function RunMeta({ run }: { run: A2uiRun }) {
  return (
    <div
      style={{
        font: '12px/1.5 system-ui, sans-serif',
        color: '#525252',
        borderLeft: '3px solid #8d8d8d',
        padding: '4px 10px',
        marginBottom: 24,
      }}>
      <div>
        <strong>Prompt:</strong> {run.prompt}
      </div>
      <div>
        <strong>Dataset:</strong> {run.dataset}
        {run.wanted?.length ? (
          <>
            {' · '}
            <strong>Wanted (not in catalog):</strong> {run.wanted.join(', ')}
          </>
        ) : null}
      </div>
    </div>
  );
}

export function A2uiPlayground({
  run,
  showMeta = false,
}: {
  run: A2uiRun;
  showMeta?: boolean;
}) {
  const processor = useMemo(() => {
    const p = new MessageProcessor([catalog]);
    p.processMessages(run.messages as Parameters<typeof p.processMessages>[0]);
    return p;
  }, [run]);

  const [surfaces, setSurfaces] = useState(() =>
    Array.from(processor.model.surfacesMap.values())
  );

  useEffect(() => {
    const sync = () =>
      setSurfaces(Array.from(processor.model.surfacesMap.values()));
    sync();
    const created = processor.onSurfaceCreated(sync);
    const deleted = processor.onSurfaceDeleted(sync);
    return () => {
      created.unsubscribe();
      deleted.unsubscribe();
    };
  }, [processor]);

  return (
    <div style={{ maxWidth: 960 }}>
      {showMeta ? <RunMeta run={run} /> : null}
      {surfaces.map((surface) => (
        <A2uiSurface key={surface.id} surface={surface} />
      ))}
    </div>
  );
}
