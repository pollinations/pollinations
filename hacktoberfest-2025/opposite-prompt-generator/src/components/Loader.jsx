export default function Loader() {
  return (
    <div className="flex flex-col items-center justify-center mt-4">
      <div className="w-12 h-12 border-4 border-purple-300/30 border-t-purple-300 rounded-full animate-spin mb-3"></div>
      <p className="text-purple-200 italic">Processing...</p>
    </div>
  );
}
