import { Component } from 'react';
import type * as React from 'react';

interface GraphErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: Error) => void;
}

interface GraphErrorBoundaryState {
  hasError: boolean;
}

const graphFallbackStyle: React.CSSProperties = {
  width: '100%',
  height: '100%'
};

export class GraphErrorBoundary extends Component<GraphErrorBoundaryProps, GraphErrorBoundaryState> {
  state: GraphErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): GraphErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return <div style={graphFallbackStyle} />;
    }

    return this.props.children;
  }
}
