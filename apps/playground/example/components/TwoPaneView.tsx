'use client';

import { type ReactNode, type RefObject } from 'react';

interface TwoPaneViewProps {
  leftPane: ReactNode;
  rightPane: ReactNode;
  resultRef?: RefObject<HTMLDivElement | null>;
}

export function TwoPaneView({
  leftPane,
  rightPane,
  resultRef,
}: TwoPaneViewProps) {
  return (
    <div className="flex flex-col lg:grid lg:grid-cols-2 gap-0 lg:gap-6 h-full overflow-y-auto lg:overflow-hidden scrollbar-hide">
      {/* Left Column: Form elements */}
      <div className="px-2 pt-8 pb-4 lg:py-8 space-y-4 lg:min-h-0 lg:overflow-y-auto scrollbar-hide">
        {leftPane}
      </div>

      {/* Right Column: Results */}
      <div
        className="px-2 pt-4 pb-8 lg:py-8 space-y-4 lg:min-h-0 lg:overflow-y-auto scrollbar-hide"
        ref={resultRef}
      >
        {rightPane}
      </div>
    </div>
  );
}
