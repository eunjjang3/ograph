# Examples

These examples demonstrate the public package boundary. They import from
`@afterglow/ograph`, not from internal source files.

The examples are typechecked in this repository through `npm run check:examples`.
That script maps `@afterglow/ograph` to the local package entry so the examples
can be verified before the first npm publication.

## Examples

- `basic/GraphPanel.tsx`: minimal graph panel with click handling.
- `app-adapter/adapter.ts`: app-domain data converted into Ograph nodes and
  links outside the package boundary.
- `app-adapter/GraphPanel.tsx`: adapter output rendered through `GraphView`.
- `large-graph/createLargeGraph.ts`: deterministic large graph fixture.
- `large-graph/LargeGraphPanel.tsx`: large graph rendered with a stable fixture.
