import type { FC } from "react";
import { getModelPrices } from "./data.ts";
import { ModelTable } from "./ModelTable.tsx";
import { Button } from "../button.tsx";

export const Pricing: FC = () => {
  const allModels = getModelPrices();

  const imageModels = allModels.filter((m) => m.type === "image");
  const videoModels = allModels.filter((m) => m.type === "video");
  const textModels = allModels.filter((m) => m.type === "text");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <h2 className="font-bold flex-1">Pricing</h2>
        <Button
          as="a"
          href="https://github.com/pollinations/pollinations/issues/5321"
          target="_blank"
          rel="noopener noreferrer"
          color="amber"
          weight="light"
          className="self-start"
        >
          🤖 Vote on next models
        </Button>
      </div>
      <div className="bg-amber-50/30 rounded-2xl p-6 border border-amber-300 space-y-6 overflow-hidden">
        <div
          className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{ overflowY: "clip" }}
        >
          <div className="space-y-8">
            <ModelTable models={imageModels} type="image" />
            <ModelTable models={videoModels} type="video" />
            <ModelTable models={textModels} type="text" />
          </div>
        </div>

        <div className="pt-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-white/50 rounded-lg p-4 border border-amber-200">
              <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">
                Model Capabilities
              </div>
              <div className="space-y-1 text-gray-600">
                <div>👁️ vision</div>
                <div>👂 audio input</div>
                <div>🧠 reasoning</div>
                <div>🔍 search</div>
              </div>
            </div>
            <div className="bg-white/50 rounded-lg p-4 border border-amber-200">
              <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">
                Pricing Metrics
              </div>
              <div className="space-y-1 text-gray-600">
                <div>
                  <strong>/image</strong> = flat rate per image
                </div>
                <div>
                  <strong>/M</strong> = cost per million tokens
                </div>
                <div>
                  <strong>/sec</strong> = cost per second of video
                </div>
              </div>
            </div>
            <div className="bg-white/50 rounded-lg p-4 border border-amber-200">
              <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">
                Token Types
              </div>
              <div className="space-y-1 text-gray-600">
                <div>💬 text input/output</div>
                <div>💾 cached input</div>
                <div>🔊 audio input/output</div>
                <div>🖼️ image</div>
                <div>🎬 video</div>
              </div>
            </div>
          </div>
          <div className="bg-amber-100/50 rounded-lg px-3 py-2 text-xs text-amber-800">
            <span className="font-semibold">* 1 pollen ≈</span> based on average
            community usage over the last 7 days. Actual costs vary with
            modality, prompt length, and output.
          </div>
        </div>

        <div className="bg-gradient-to-r from-amber-100 to-orange-100 rounded-xl p-4 border border-amber-300 text-center">
          <p className="text-sm font-medium text-amber-900">
            🎁 <span className="font-bold">Beta bonus:</span> 2x pollen on every
            purchase!
          </p>
          <p className="text-xs text-amber-700 mt-1">
            Prices may adjust as we fine-tune during beta.
          </p>
        </div>
      </div>
    </div>
  );
};
