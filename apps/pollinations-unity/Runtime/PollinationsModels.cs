using System;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace Pollinations.Unity
{
    public enum PollinationsModality
    {
        Text,
        Image,
        Audio
    }

    [Serializable]
    public sealed class PollinationsModel
    {
        public string name;
        public string title;
        public string description;
        public string provider;
    }

    public static class PollinationsModels
    {
        public static async Task<PollinationsModel[]> FetchAsync(
            PollinationsModality modality,
            CancellationToken cancellationToken = default(CancellationToken))
        {
            var path = modality == PollinationsModality.Text ? "/text/models"
                : modality == PollinationsModality.Image ? "/image/models"
                : "/audio/models";
            using (var web = UnityWebRequest.Get(PollinationsClient.GenerationBaseUrl + path))
            {
                await SendAsync(web, cancellationToken);
                if (web.result != UnityWebRequest.Result.Success)
                    throw new PollinationsException("Could not load Pollinations model list.", web.responseCode);

                var json = web.downloadHandler.text.Trim();
                if (json.StartsWith("[", StringComparison.Ordinal))
                    json = "{\"items\":" + json + "}";
                var response = JsonUtility.FromJson<ModelList>(json);
                return response?.items ?? Array.Empty<PollinationsModel>();
            }
        }

        private static Task SendAsync(UnityWebRequest web, CancellationToken cancellationToken)
        {
            var completion = new TaskCompletionSource<bool>();
            web.SendWebRequest().completed += _ => completion.TrySetResult(true);
            if (cancellationToken.CanBeCanceled)
                cancellationToken.Register(() => { web.Abort(); completion.TrySetCanceled(); });
            return completion.Task;
        }

        [Serializable]
        private sealed class ModelList
        {
            public PollinationsModel[] items;
        }
    }
}