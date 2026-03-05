/// <reference types="vite/client" />

// Type shim for react-cytoscapejs (no @types package available)
declare module 'react-cytoscapejs' {
  import * as cytoscape from 'cytoscape';
  import * as React from 'react';

  interface CytoscapeComponentProps {
    elements: cytoscape.ElementDefinition[];
    stylesheet?: cytoscape.Stylesheet[] | cytoscape.StylesheetCSS[] | string;
    layout?: cytoscape.LayoutOptions;
    style?: React.CSSProperties;
    cy?: (cy: cytoscape.Core) => void;
    minZoom?: number;
    maxZoom?: number;
    wheelSensitivity?: number;
    [key: string]: unknown;
  }

  const CytoscapeComponent: React.FC<CytoscapeComponentProps>;
  export default CytoscapeComponent;
}
