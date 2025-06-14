import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ExpandedViewContextType {
  isExpandedView: boolean;
  setIsExpandedView: (expanded: boolean) => void;
  toggleExpandedView: () => void;
}

const ExpandedViewContext = createContext<ExpandedViewContextType | undefined>(undefined);

export function ExpandedViewProvider({ children }: { children: ReactNode }) {
  const [isExpandedView, setIsExpandedView] = useState(false);

  const toggleExpandedView = () => {
    setIsExpandedView(prev => !prev);
  };

  return (
    <ExpandedViewContext.Provider value={{ isExpandedView, setIsExpandedView, toggleExpandedView }}>
      {children}
    </ExpandedViewContext.Provider>
  );
}

export function useExpandedView() {
  const context = useContext(ExpandedViewContext);
  if (context === undefined) {
    throw new Error('useExpandedView must be used within an ExpandedViewProvider');
  }
  return context;
}