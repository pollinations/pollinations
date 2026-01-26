const App = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
          myceli<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">.ai</span>
        </h1>
        <p className="text-xl md:text-2xl text-gray-300">
          presents
        </p>
        <h2 className="text-3xl md:text-5xl font-bold text-white mt-4">
          pollinations<span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500">.ai</span>
        </h2>
        <p className="text-gray-500 mt-8 text-sm">
          Pitch deck coming soon
        </p>
      </div>
    </div>
  );
};

export default App;
