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
    <div className="flex flex-col lg:grid lg:grid-cols-2 gap-0 lg:gap-8 h-full overflow-y-auto lg:overflow-hidden scrollbar-hide">
      {/* Left Column: Form elements */}
      <div className="px-4 pt-10 pb-6 lg:py-10 space-y-6 lg:min-h-0 lg:overflow-y-auto scrollbar-hide">
        {leftPane}
      </div>

      {/* Right Column: Results */}
      <div
        className="px-4 pt-6 pb-10 lg:py-10 space-y-6 lg:min-h-0 lg:overflow-y-auto scrollbar-hide"
        ref={resultRef}
      >
        {rightPane}
      </div>
    </div>
  );
}
