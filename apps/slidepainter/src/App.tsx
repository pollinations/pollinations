import React from 'react';
import SlidePainter from './components/SlidePainter';

const App: React.FC = () => {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-950 text-gray-100">
      <main className="flex-1 min-h-0 flex flex-col">
        <SlidePainter />
      </main>
    </div>
  );
};

export default App;
