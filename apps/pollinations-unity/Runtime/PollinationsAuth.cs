using System;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace Pollinations.Unity
{
    public enum DeviceFlowState
    {
        Granted,
        Denied,
        Expired
    }

    public sealed class DeviceFlowResult
    {
        public DeviceFlowState State;
        public string AccessToken;
        public string UserCode;
        public string VerificationUri;
        public string Error;
    }

    public sealed class DeviceFlowProgress
    {
        public string State;
        public string Message;
        public string UserCode;
        public string VerificationUri;
    }

    public sealed class PollinationsAuth
    {
        public const string AuthBaseUrl = "https://enter.pollinations.ai";
        public string ClientId { get; }

        public PollinationsAuth(string clientId)
        {
            if (string.IsNullOrEmpty(clientId) || !clientId.StartsWith("pk_", StringComparison.Ordinal))
                throw new ArgumentException("Device flow requires a publishable App Key starting with pk_.", nameof(clientId));
            ClientId = clientId;
        }

        public async Task<DeviceFlowResult> AuthorizeAsync(
            Action<DeviceFlowProgress> onProgress = null,
            CancellationToken cancellationToken = default(CancellationToken))
        {
            var client = new PollinationsClient();
            var codeResponse = await client.SendJsonAsync(
                UnityEngine.Networking.UnityWebRequest.kHttpVerbPOST,
                "/api/device/code",
                JsonUtility.ToJson(new DeviceCodeRequest { client_id = ClientId }),
                AuthBaseUrl,
                cancellationToken);
            var code = JsonUtility.FromJson<DeviceCodeResponse>(codeResponse.Body);
            if (code == null || string.IsNullOrEmpty(code.device_code))
                throw new PollinationsException("Pollinations did not return a device code.", codeResponse.StatusCode);

            var verificationUri = code.verification_uri;
            if (!verificationUri.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                verificationUri = AuthBaseUrl + (verificationUri.StartsWith("/") ? string.Empty : "/") + verificationUri;

            var progress = new DeviceFlowProgress
            {
                State = "authorization_pending",
                Message = "Open " + verificationUri + " and enter " + code.user_code + ".",
                UserCode = code.user_code,
                VerificationUri = verificationUri
            };
            onProgress?.Invoke(progress);

            var interval = Math.Max(1, code.interval == 0 ? 5 : code.interval);
            var expiresAt = DateTime.UtcNow.AddSeconds(code.expires_in == 0 ? 600 : code.expires_in);
            while (DateTime.UtcNow < expiresAt)
            {
                await Task.Delay(TimeSpan.FromSeconds(interval), cancellationToken);
                var tokenResponse = await client.SendJsonAsync(
                    UnityEngine.Networking.UnityWebRequest.kHttpVerbPOST,
                    "/api/device/token",
                    JsonUtility.ToJson(new DeviceTokenRequest
                    {
                        client_id = ClientId,
                        device_code = code.device_code
                    }),
                    AuthBaseUrl,
                    cancellationToken,
                    true);
                var token = JsonUtility.FromJson<DeviceTokenResponse>(tokenResponse.Body);
                if (token != null && !string.IsNullOrEmpty(token.access_token))
                {
                    onProgress?.Invoke(new DeviceFlowProgress { State = "granted", Message = "Access granted." });
                    return new DeviceFlowResult
                    {
                        State = DeviceFlowState.Granted,
                        AccessToken = token.access_token,
                        UserCode = code.user_code,
                        VerificationUri = verificationUri
                    };
                }

                var error = token == null ? string.Empty : token.error;
                if (error == "authorization_pending")
                    continue;
                if (error == "slow_down")
                {
                    interval += 5;
                    continue;
                }
                if (error == "access_denied")
                    return new DeviceFlowResult { State = DeviceFlowState.Denied, Error = error };
                if (error == "expired_token")
                    return new DeviceFlowResult { State = DeviceFlowState.Expired, Error = error };
                if (!string.IsNullOrEmpty(error))
                    throw new PollinationsException("Pollinations device flow failed: " + error, tokenResponse.StatusCode);
            }

            return new DeviceFlowResult { State = DeviceFlowState.Expired, Error = "expired_token" };
        }

        [Serializable]
        private sealed class DeviceCodeRequest
        {
            public string client_id;
        }

        [Serializable]
        private sealed class DeviceTokenRequest
        {
            public string client_id;
            public string device_code;
        }

        [Serializable]
        private sealed class DeviceCodeResponse
        {
            public string device_code;
            public string user_code;
            public string verification_uri;
            public int expires_in;
            public int interval;
        }

        [Serializable]
        private sealed class DeviceTokenResponse
        {
            public string access_token;
            public string token_type;
            public string error;
        }
    }
}