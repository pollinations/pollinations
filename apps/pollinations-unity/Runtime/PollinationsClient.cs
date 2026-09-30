// PollinationsClient.cs — Core async client for text, image, and speech generation
// via the Pollinations API (https://gen.pollinations.ai)
//
// Usage:
//   var client = gameObject.AddComponent<PollinationsClient>();
//   client.ApiKey = "sk_...";
//   string text = await client.GenerateText("Hello, world!", model: "openai/gpt-5.4-nano");
//   Texture2D img = await client.GenerateImage("a fantasy castle", width: 512, height: 512);
//   AudioClip clip = await client.GenerateSpeech("Hello from Pollinations", voice: "nova");

using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace Pollinations.Unity
{
    /// <summary>
    /// Async C# helper for Pollinations text, image, and speech generation.
    /// Attach to any GameObject in your scene.
    /// </summary>
    [AddComponentMenu("Pollinations/Pollinations Client")]
    public class PollinationsClient : MonoBehaviour
    {
        [Header("Configuration")]
        [Tooltip("Your Pollinations API key. Get one at https://enter.pollinations.ai/keys")]
        public string ApiKey = "";

        [Tooltip("Base URL for the Pollinations generation API")]
        public string BaseUrl = "https://gen.pollinations.ai";

        [Header("Defaults")]
        [Tooltip("Default text model when none is specified")]
        public string DefaultTextModel = "openai/gpt-5.4-nano";

        [Tooltip("Default image model when none is specified")]
        public string DefaultImageModel = "gptimage";

        [Tooltip("Default audio/speech model when none is specified")]
        public string DefaultSpeechModel = "openai/gpt-4o-mini-tts";

        [Tooltip("Default voice for speech generation")]
        public string DefaultVoice = "nova";

        // ---- Public API ----

        /// <summary>
        /// Generate text from a prompt using the chat completions endpoint.
        /// </summary>
        /// <param name="prompt">The user message to send.</param>
        /// <param name="model">Optional model name. Defaults to DefaultTextModel.</param>
        /// <param name="systemPrompt">Optional system instruction.</param>
        /// <param name="maxTokens">Maximum completion tokens.</param>
        /// <param name="cancellationToken">Optional cancellation token.</param>
        /// <returns>The generated text content.</returns>
        public async Task<string> GenerateText(
            string prompt,
            string model = null,
            string systemPrompt = null,
            int maxTokens = 1024,
            CancellationToken cancellationToken = default)
        {
            model = string.IsNullOrEmpty(model) ? DefaultTextModel : model;

            var payload = new
            {
                model,
                messages = new[]
                {
                    ...(systemPrompt != null
                        ? new[] { new { role = "system", content = systemPrompt } }
                        : System.Array.Empty<object>()),
                    new { role = "user", content = prompt }
                },
                max_tokens = maxTokens
            };

            string json = JsonUtility.ToJson(new Wrapper(payload));
            UnityWebRequest request = new UnityWebRequest(
                $"{BaseUrl}/v1/chat/completions", "POST");
            byte[] body = Encoding.UTF8.GetBytes(json);
            request.uploadHandler = new UploadHandlerRaw(body);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            if (!string.IsNullOrEmpty(ApiKey))
                request.SetRequestHeader("Authorization", $"Bearer {ApiKey}");

            await SendRequestAsync(request, cancellationToken);

            string responseJson = request.downloadHandler.text;
            var resp = JsonUtility.FromJson<ChatCompletionResponse>(responseJson);
            if (resp.choices?.Length > 0 && resp.choices[0]?.message?.content != null)
                return resp.choices[0].message.content;

            throw new Exception($"Pollinations text generation failed: {resp.error?.message ?? "No content in response"}");
        }

        /// <summary>
        /// Generate an image from a prompt.
        /// </summary>
        /// <param name="prompt">Image description prompt.</param>
        /// <param name="model">Optional model. Defaults to DefaultImageModel.</param>
        /// <param name="width">Image width in pixels.</param>
        /// <param name="height">Image height in pixels.</param>
        /// <param name="nologo">If true, removes the Pollinations logo from the image.</param>
        /// <param name="cancellationToken">Optional cancellation token.</param>
        /// <returns>A Texture2D of the generated image.</returns>
        public async Task<Texture2D> GenerateImage(
            string prompt,
            string model = null,
            int width = 1024,
            int height = 1024,
            bool nologo = true,
            CancellationToken cancellationToken = default)
        {
            model = string.IsNullOrEmpty(model) ? DefaultImageModel : model;

            string url = $"{_GetImageHost()}/image/{UnityWebRequest.EscapeURL(prompt)}?model={UnityWebRequest.EscapeURL(model)}&width={width}&height={height}&nologo={nologo.ToString().ToLower()}";
            if (!string.IsNullOrEmpty(ApiKey))
                url += $"&key={UnityWebRequest.EscapeURL(ApiKey)}";

            UnityWebRequest request = UnityWebRequestTexture.GetTexture(url);
            await SendRequestAsync(request, cancellationToken);

            if (request.result != UnityWebRequest.Result.Success)
                throw new Exception($"Image generation failed: {request.error}");

            var texture = DownloadHandlerTexture.GetTexture(request.downloadHandler);
            texture.name = $"pollinations_{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";
            return texture;
        }

        /// <summary>
        /// Generate speech/audio from text.
        /// </summary>
        /// <param name="prompt">Text to convert to speech.</param>
        /// <param name="voice">Voice name (e.g. "nova", "alloy", "echo", "fable", "onyx", "shimmer").</param>
        /// <param name="model">Optional model. Defaults to DefaultSpeechModel.</param>
        /// <param name="cancellationToken">Optional cancellation token.</param>
        /// <returns>An AudioClip of the generated speech.</returns>
        public async Task<AudioClip> GenerateSpeech(
            string prompt,
            string voice = null,
            string model = null,
            CancellationToken cancellationToken = default)
        {
            voice = string.IsNullOrEmpty(voice) ? DefaultVoice : voice;
            model = string.IsNullOrEmpty(model) ? DefaultSpeechModel : model;

            string url = $"{BaseUrl}/audio/{UnityWebRequest.EscapeURL(prompt)}?voice={UnityWebRequest.EscapeURL(voice)}";
            if (!string.IsNullOrEmpty(model))
                url += $"&model={UnityWebRequest.EscapeURL(model)}";
            if (!string.IsNullOrEmpty(ApiKey))
                url += $"&key={UnityWebRequest.EscapeURL(ApiKey)}";

            UnityWebRequest request = UnityWebRequestMultimedia.GetAudioClip(url, AudioType.MPEG);
            request.downloadHandler = new DownloadHandlerAudioClip(url, AudioType.MPEG);
            await SendRequestAsync(request, cancellationToken);

            if (request.result != UnityWebRequest.Result.Success)
                throw new Exception($"Speech generation failed: {request.error}");

            var clip = DownloadHandlerAudioClip.GetAudioClip(request.downloadHandler);
            clip.name = $"pollinations_speech_{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";
            return clip;
        }

        /// <summary>
        /// Get available text models.
        /// </summary>
        public async Task<List<ModelInfo>> GetTextModels(CancellationToken ct = default)
            => await _FetchModelList("text", ct);

        /// <summary>
        /// Get available image models.
        /// </summary>
        public async Task<List<ModelInfo>> GetImageModels(CancellationToken ct = default)
            => await _FetchModelList("image", ct);

        /// <summary>
        /// Get available audio models.
        /// </summary>
        public async Task<List<ModelInfo>> GetAudioModels(CancellationToken ct = default)
            => await _FetchModelList("audio", ct);

        // ---- Internal helpers ----

        private string _GetImageHost() => BaseUrl.Replace("gen.", "image.");

        private async Task<List<ModelInfo>> _FetchModelList(string type, CancellationToken ct)
        {
            string url = $"{BaseUrl}/{type}/models";
            UnityWebRequest request = UnityWebRequest.Get(url);
            if (!string.IsNullOrEmpty(ApiKey))
                request.SetRequestHeader("Authorization", $"Bearer {ApiKey}");
            request.downloadHandler = new DownloadHandlerBuffer();

            await SendRequestAsync(request, ct);

            string json = request.downloadHandler.text;
            var arr = JsonHelper.FromJson<ModelInfo>(json);
            return new List<ModelInfo>(arr);
        }

        private async Task SendRequestAsync(UnityWebRequest request, CancellationToken ct)
        {
            var op = request.SendWebRequest();
            while (!op.isDone)
            {
                if (ct.IsCancellationRequested)
                {
                    request.Abort();
                    throw new OperationCanceledException("Request cancelled by user.");
                }
                await Task.Yield();
            }

#if UNITY_2020_1_OR_NEWER
            if (request.result != UnityWebRequest.Result.Success)
                throw new Exception($"HTTP {request.responseCode}: {request.error}");
#else
            if (request.isNetworkError || request.isHttpError)
                throw new Exception($"HTTP {request.responseCode}: {request.error}");
#endif
        }

        // ---- DTOs ----

        [Serializable]
        private class Wrapper
        {
            public object payload;
            public Wrapper(object p) => payload = p;
        }

        [Serializable]
        private class ChatCompletionResponse
        {
            public Choice[] choices;
            public APIErrorResponse error;
        }

        [Serializable]
        private class Choice
        {
            public Message message;
        }

        [Serializable]
        private class Message
        {
            public string content;
        }

        [Serializable]
        private class APIErrorResponse
        {
            public string message;
            public string code;
        }

        [Serializable]
        public class ModelInfo
        {
            public string name;
            public string[] aliases;
            public string category;
            public string publisher;
            public string title;
            public string description;
            public string[] supported_endpoints;
            public bool community;
            public bool paid_only;
        }
    }
}
