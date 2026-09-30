// PollinationsAuth.cs — OAuth 2.0 Device Flow authentication for Pollinations
//
// Allows players to authenticate with their own Pollinations account (BYOP)
// so they pay for generation with their own Pollen balance.
//
// Usage:
//   var auth = gameObject.AddComponent<PollinationsAuth>();
//   await auth.StartDeviceFlow(clientId: "pk_...");
//   // User visits https://enter.pollinations.ai/device, enters code
//   // Token is stored internally and can be retrieved via auth.AccessToken

using System;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace Pollinations.Unity.Auth
{
    public enum DeviceFlowState
    {
        Pending,
        Granted,
        Denied,
        Expired
    }

    public class DeviceFlowResult
    {
        public DeviceFlowState State { get; set; }
        public string AccessToken { get; set; }
        public string UserCode { get; set; }
        public string VerificationUri { get; set; }
        public string VerificationUriComplete { get; set; }
        public int ExpiresIn { get; set; }
        public int Interval { get; set; }
    }

    [AddComponentMenu("Pollinations/Pollinations Auth")]
    public class PollinationsAuth : MonoBehaviour
    {
        [Header("Device Flow")]
        [Tooltip("Publishable key (pk_...) from https://enter.pollinations.ai/keys")]
        public string ClientId = "";

        [Tooltip("Scope requested for the access token")]
        public string Scope = "usage";

        /// <summary>Stored access token after successful device flow.</summary>
        public string AccessToken { get; private set; }

        private const string DeviceAuthUrl = "https://enter.pollinations.ai/device";
        private const string DeviceTokenUrl = "https://enter.pollinations.ai/device/token";
        private const string AuthUrl = "https://enter.pollinations.ai/authorize";

        /// <summary>
        /// Initiates the OAuth 2.0 Device Authorization Grant flow.
        /// The user must visit VerificationUri and enter the UserCode.
        /// Returns a DeviceFlowResult with the pending state and URLs for UI display.
        /// </summary>
        public async Task<DeviceFlowResult> StartDeviceFlow(string clientId = null, CancellationToken ct = default)
        {
            string key = string.IsNullOrEmpty(clientId) ? ClientId : clientId;
            if (string.IsNullOrEmpty(key))
                throw new Exception("ClientId (publishable key pk_...) is required for device flow.");

            var form = new List< KeyValuePair<string, string>>
            {
                new("client_id", key)
            };
            if (!string.IsNullOrEmpty(Scope))
                form.Add(new("scope", Scope));

            UnityWebRequest request = UnityWebRequest.Post(DeviceAuthUrl, form);
            request.downloadHandler = new DownloadHandlerBuffer();

            var op = request.SendWebRequest();
            while (!op.isDone)
            {
                if (ct.IsCancellationRequested)
                {
                    request.Abort();
                    throw new OperationCanceledException("Device flow initiation cancelled.");
                }
                await Task.Yield();
            }

#if UNITY_2020_1_OR_NEWER
            if (request.result != UnityWebRequest.Result.Success)
                throw new Exception($"Device flow initiation failed: HTTP {request.responseCode} {request.error}");
#else
            if (request.isNetworkError || request.isHttpError)
                throw new Exception($"Device flow initiation failed: HTTP {request.responseCode} {request.error}");
#endif

            string json = request.downloadHandler.text;
            var resp = JsonUtility.FromJson<DeviceAuthResponse>(json);

            return new DeviceFlowResult
            {
                State = DeviceFlowState.Pending,
                UserCode = resp.user_code,
                VerificationUri = resp.verification_uri,
                VerificationUriComplete = resp.verification_uri_complete,
                ExpiresIn = resp.expires_in,
                Interval = resp.interval
            };
        }

        /// <summary>
        /// Polls the token endpoint until the user completes device flow
        /// or the flow times out.
        /// </summary>
        public async Task<DeviceFlowResult> PollToken(string deviceCode, string clientId = null, CancellationToken ct = default)
        {
            string key = string.IsNullOrEmpty(clientId) ? ClientId : clientId;

            var form = new List<KeyValuePair<string, string>>
            {
                new("device_code", deviceCode),
                new("client_id", key),
                new("grant_type", "urn:ietf:params:oauth:grant-type:device_code")
            };

            UnityWebRequest request = UnityWebRequest.Post(DeviceTokenUrl, form);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/x-www-form-urlencoded");

            var op = request.SendWebRequest();
            while (!op.isDone) { await Task.Yield(); }

#if UNITY_2020_1_OR_NEWER
            bool isError = request.result != UnityWebRequest.Result.Success;
#else
            bool isError = request.isNetworkError || request.isHttpError;
#endif

            if (isError)
            {
                int code = request.responseCode;
                string respBody = request.downloadHandler?.text ?? "";

                if (code == 400 && (respBody.Contains("authorization_pending") || respBody.Contains("slow_down")))
                {
                    return new DeviceFlowResult { State = DeviceFlowState.Pending, UserCode = deviceCode };
                }
                if (code == 400 && respBody.Contains("expired_token"))
                {
                    return new DeviceFlowResult { State = DeviceFlowState.Expired, UserCode = deviceCode };
                }
                if (code == 400 && (respBody.Contains("access_denied") || respBody.Contains("denied")))
                {
                    return new DeviceFlowResult { State = DeviceFlowState.Denied, UserCode = deviceCode };
                }

                throw new Exception($"Token polling failed: HTTP {code} {request.error} {respBody}");
            }

            string json = request.downloadHandler.text;
            var resp = JsonUtility.FromJson<TokenResponse>(json);

            if (!string.IsNullOrEmpty(resp.access_token))
            {
                AccessToken = resp.access_token;
                return new DeviceFlowResult
                {
                    State = DeviceFlowState.Granted,
                    AccessToken = resp.access_token,
                    UserCode = deviceCode
                };
            }

            return new DeviceFlowResult { State = DeviceFlowState.Pending, UserCode = deviceCode };
        }

        // ---- Quick-browser flow (for headless tools / simple auth) ----

        /// <summary>
        /// Generates a browser-based authorization URL for quick sign-in.
        /// </summary>
        public string GetAuthorizationUrl(string clientId = null)
        {
            string key = string.IsNullOrEmpty(clientId) ? ClientId : clientId;
            string url = $"{AuthUrl}?client_id={UnityWebRequest.EscapeURL(key)}&redirect_uri={UnityWebRequest.EscapeURL(Application.absoluteURL)}";
            if (!string.IsNullOrEmpty(Scope))
                url += $"&scope={UnityWebRequest.EscapeURL(Scope)}";
            return url;
        }

        // ---- DTOs ----

        [Serializable]
        private class DeviceAuthResponse
        {
            public string device_code;
            public string user_code;
            public string verification_uri;
            public string verification_uri_complete;
            public int expires_in;
            public int interval;
        }

        [Serializable]
        private class TokenResponse
        {
            public string access_token;
            public string token_type;
            public int expires_in;
            public string scope;
        }
    }
}
