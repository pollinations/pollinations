import React from "react";
import { FileText, Loader2 } from "lucide-react";
import Logo from "../assets/pollinations-logo.svg";

const RepoInput = ({ onGenerate, loading }) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    onGenerate("pollinations/pollinations");
  };

  return (
    <div className="w-full max-w-3xl mx-auto text-center">
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center">
          <img
            src={Logo}
            alt="Pollinations Logo"
            className="w-55  h-auto mb-3 invert brightness-50"
          />

          <h1 className="text-6xl font-[Pacifico] text-gray-600">Changelog</h1>
        </div>

        <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Automatically generate a human-readable changelog from the latest
          commits in the Pollinations repository. Powered by AI to transform
          technical git messages into clear, understandable updates.
        </p>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="mt-4 px-8 py-4 bg-blue-600 text-white text-lg rounded-lg font-semibold hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center gap-3"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={24} />
              Generating Changelog...
            </>
          ) : (
            <>
              <FileText size={24} />
              Generate Changelog
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default RepoInput;
