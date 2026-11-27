import type { CSSProperties } from 'react';
import type { GraphNode, GraphNodeMetadata, GraphTooltipOptions } from './types';

const positionStyle: CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: 16,
  pointerEvents: 'none'
};

const defaultStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  maxWidth: 280,
  overflow: 'hidden',
  border: '1px solid #2b2b36',
  borderRadius: 4,
  backgroundColor: '#1e1e24',
  boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.35), 0 8px 10px -6px rgb(0 0 0 / 0.35)',
  color: 'rgb(255 255 255 / 0.8)',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 12,
  lineHeight: 1.35,
  padding: '6px 12px',
  whiteSpace: 'nowrap'
};

const dotStyle: CSSProperties = {
  flex: '0 0 auto', width: 8, height: 8, borderRadius: 9999, backgroundColor: '#38bdf8'
};
const labelStyle: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' };
const typeStyle: CSSProperties = { flex: '0 0 auto', color: 'rgb(255 255 255 / 0.4)', marginLeft: 4 };

export function GraphTooltip<Metadata extends GraphNodeMetadata>({ node, tooltip }: {
  node: GraphNode<Metadata> | null | undefined;
  tooltip?: boolean | GraphTooltipOptions<Metadata>;
}) {
  if (!node || tooltip === false) return null;
  const options = typeof tooltip === 'object' && tooltip !== null ? tooltip : undefined;
  const render = options?.render;
  const content = render ? render(node) : (
    <>
      <span style={{ ...dotStyle, ...options?.dotStyle }} />
      <span style={{ ...labelStyle, ...options?.labelStyle }}>{node.label || node.id}</span>
      <span style={{ ...typeStyle, ...options?.typeStyle }}>({node.type || 'note'})</span>
    </>
  );
  if (content == null || typeof content === 'boolean') return null;

  return (
    <div
      id="hover-tooltip"
      role="tooltip"
      className={options?.className}
      style={{ ...positionStyle, ...(!render ? defaultStyle : undefined), ...options?.style }}
    >
      {content}
    </div>
  );
}
