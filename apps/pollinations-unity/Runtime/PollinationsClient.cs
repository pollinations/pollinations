using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace Pollinations.Unity
{
    [Serializable]
    public sealed class PollinationsMessage
    {
        public string role;
        public string content;

        public PollinationsMessage(string role, string content)
        {
            this.role = role;
            this.content = content;
        }
    }

    [Serializable]
    public sealed class TextResult
    {
        public string Text;
        public string Model;
        public string RawJson;
    }

    [Serializable]
    public sealed class ImageResult
    {
        public Texture2D Texture;
        public byte[] ImageBytes;
        public string Model;
    }

    [Serializable]
    public sealed class SpeechResult
    {
        public AudioClip Clip;
        public string ContentType;
    }

    public sealed class PollinationsException : Exception
    {
        public long StatusCode { get; }

        public PollinationsException(string message, long statusCode = 0) : base(message)
        {
            StatusCode = statusCode;
        }
    }

    public sealed class PollinationsClient
    {
        public const string GenerationBaseUrl = "https://gen.pollinations.ai";
        public string ApiKey { get; set; }
        public string DeviceToken { get; set; }
        public string TextModel { get; set; } = "openai/gpt-5.4-nano";
        public string ImageModel { get; set; } = "flux";
        public string SpeechModel { get; set; } = "openai-audio";

        private string AccessToken => string.IsNullOrEmpty(DeviceToken) ? ApiKey : DeviceToken;

        public Task<TextResult> TextAsync(
            string prompt,
            string model = null,
            CancellationToken cancellationToken = default(CancellationToken))
        {
            return TextAsync(
                new[] { new PollinationsMessage("user", prompt) },
                model,
                cancellationToken);
        }

        public async Task<TextResult> TextAsync(
            IReadOnlyList<PollinationsMessage> messages,
            string model = null,
            CancellationToken cancellationToken = default(CancellationToken))
        {
            EnsureToken();
            var request = new ChatRequest
            {
                model = string.IsNullOrEmpty(model) ? TextModel : model,
                messages = ToArray(messages)
            };
            var response = await SendJsonAsync(
                UnityWebRequest.kHttpVerbPOST,
                "/v1/chat/completions",
                JsonUtility.ToJson(request),
                null,
                cancellationToken);
            var parsed = JsonUtility.FromJson<ChatResponse>(response.Body);
            if (parsed == null || parsed.choices == null || parsed.choices.Length == 0)
                throw new PollinationsException("Pollinations returned no text choices.", response.StatusCode);

            return new TextResult
            {
                Text = parsed.choices[0].message == null ? string.Empty : parsed.choices[0].message.content,
                Model = parsed.model,
                RawJson = response.Body
            };
        }

        public async Task<ImageResult> ImageAsync(
            string prompt,
            string model = null,
            int width = 1024,
            int height = 1024,
            CancellationToken cancellationToken = default(CancellationToken))
        {
            EnsureToken();
            var request = new ImageRequest
            {
                prompt = prompt,
                model = string.IsNullOrEmpty(model) ? ImageModel : model,
                width = width,
                height = height,
                n = 1,
                response_format = "b64_json"
            };
            var response = await SendJsonAsync(
                UnityWebRequest.kHttpVerbPOST,
                "/v1/images/generations",
                JsonUtility.ToJson(request),
                null,
                cancellationToken);
            var parsed = JsonUtility.FromJson<ImageResponse>(response.Body);
            if (parsed == null || parsed.data == null || parsed.data.Length == 0)
                throw new PollinationsException("Pollinations returned no image data.", response.StatusCode);

            var item = parsed.data[0];
            byte[] bytes;
            if (!string.IsNullOrEmpty(item.b64_json))
            {
                try
                {
                    bytes = Convert.FromBase64String(item.b64_json);
                }
                catch (FormatException ex)
                {
                    throw new PollinationsException("Pollinations returned invalid base64 image data: " + ex.Message);
                }
            }
            else if (!string.IsNullOrEmpty(item.url))
            {
                bytes = await DownloadBytesAsync(item.url, cancellationToken);
            }
            else
            {
                throw new PollinationsException("Pollinations returned an image without bytes or a URL.");
            }

            var texture = new Texture2D(2, 2);
            if (!texture.LoadImage(bytes, true))
                throw new PollinationsException("Unity could not decode the returned image.");

            return new ImageResult { Texture = texture, ImageBytes = bytes, Model = parsed.model };
        }

        public async Task<SpeechResult> SpeechAsync(
            string text,
            string model = null,
            string voice = "alloy",
            string responseFormat = "wav",
            CancellationToken cancellationToken = default(CancellationToken))
        {
            EnsureToken();
            var request = new SpeechRequest
            {
                model = string.IsNullOrEmpty(model) ? SpeechModel : model,
                input = text,
                voice = voice,
                response_format = responseFormat
            };
            var body = JsonUtility.ToJson(request);
            var url = GenerationBaseUrl + "/v1/audio/speech";
            using (var web = new UnityWebRequest(url, UnityWebRequest.kHttpVerbPOST))
            {
                web.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
                web.downloadHandler = new DownloadHandlerAudioClip(url, AudioType.UNKNOWN);
                SetHeaders(web);
                await SendAsync(web, cancellationToken);
                EnsureSuccess(web);
                return new SpeechResult
                {
                    Clip = ((DownloadHandlerAudioClip)web.downloadHandler).audioClip,
                    ContentType = web.GetResponseHeader("Content-Type")
                };
            }
        }

        internal async Task<JsonResponse> SendJsonAsync(
            string method,
            string path,
            string body,
            string baseUrl,
            CancellationToken cancellationToken,
            bool allowErrorResponse = false)
        {
            var url = (string.IsNullOrEmpty(baseUrl) ? GenerationBaseUrl : baseUrl) + path;
            using (var web = new UnityWebRequest(url, method))
            {
                if (body != null)
                {
                    web.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
                    web.uploadHandler.contentType = "application/json";
                }
                web.downloadHandler = new DownloadHandlerBuffer();
                SetHeaders(web);
                await SendAsync(web, cancellationToken);
                if (!allowErrorResponse)
                    EnsureSuccess(web);
                return new JsonResponse(web.downloadHandler.text, web.responseCode);
            }
        }

        private async Task<byte[]> DownloadBytesAsync(string url, CancellationToken cancellationToken)
        {
            using (var web = UnityWebRequest.Get(url))
            {
                await SendAsync(web, cancellationToken);
                EnsureSuccess(web);
                return web.downloadHandler.data;
            }
        }

        private void SetHeaders(UnityWebRequest web)
        {
            web.SetRequestHeader("Accept", "application/json");
            if (!string.IsNullOrEmpty(AccessToken))
                web.SetRequestHeader("Authorization", "Bearer " + AccessToken);
        }

        private void EnsureToken()
        {
            if (string.IsNullOrEmpty(AccessToken))
                throw new PollinationsException("Set ApiKey or DeviceToken before making a Pollinations request.");
        }

        private static void EnsureSuccess(UnityWebRequest web)
        {
            if (web.result == UnityWebRequest.Result.Success)
                return;

            var message = web.responseCode == 401 ? "Pollinations rejected the key."
                : web.responseCode == 402 ? "The Pollinations account has insufficient Pollen."
                : web.responseCode == 429 ? "Pollinations rate-limited the request."
                : "Pollinations request failed (" + web.responseCode + ").";
            throw new PollinationsException(message, web.responseCode);
        }

        private static Task SendAsync(UnityWebRequest web, CancellationToken cancellationToken)
        {
            var completion = new TaskCompletionSource<bool>();
            var operation = web.SendWebRequest();
            operation.completed += _ => completion.TrySetResult(true);
            if (cancellationToken.CanBeCanceled)
            {
                cancellationToken.Register(() =>
                {
                    web.Abort();
                    completion.TrySetCanceled();
                });
            }
            return completion.Task;
        }

        private static PollinationsMessage[] ToArray(IReadOnlyList<PollinationsMessage> messages)
        {
            if (messages == null || messages.Count == 0)
                throw new ArgumentException("At least one chat message is required.", nameof(messages));
            var result = new PollinationsMessage[messages.Count];
            for (var i = 0; i < messages.Count; i++)
                result[i] = messages[i];
            return result;
        }

        [Serializable]
        private sealed class ChatRequest
        {
            public string model;
            public PollinationsMessage[] messages;
        }

        [Serializable]
        private sealed class ImageRequest
        {
            public string prompt;
            public string model;
            public int width;
            public int height;
            public int n;
            public string response_format;
        }

        [Serializable]
        private sealed class SpeechRequest
        {
            public string model;
            public string input;
            public string voice;
            public string response_format;
        }

        [Serializable]
        private sealed class ChatResponse
        {
            public string model;
            public ChatChoice[] choices;
        }

        [Serializable]
        private sealed class ChatChoice
        {
            public ChatMessage message;
        }

        [Serializable]
        private sealed class ChatMessage
        {
            public string content;
        }

        [Serializable]
        private sealed class ImageResponse
        {
            public string model;
            public ImageData[] data;
        }

        [Serializable]
        private sealed class ImageData
        {
            public string b64_json;
            public string url;
        }

        internal readonly struct JsonResponse
        {
            public readonly string Body;
            public readonly long StatusCode;

            public JsonResponse(string body, long statusCode)
            {
                Body = body;
                StatusCode = statusCode;
            }
        }
    }
}