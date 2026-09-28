using NUnit.Framework;
using Pollinations.Unity;
using UnityEngine;

namespace Pollinations.Unity.Tests
{
    public sealed class PollinationsClientTests
    {
        [Test]
        public void TextClientStartsWithoutPersistingCredentials()
        {
            var client = new PollinationsClient();
            Assert.IsNull(client.ApiKey);
            Assert.IsNull(client.DeviceToken);
        }

        [Test]
        public void DeviceFlowRequiresPublishableKey()
        {
            Assert.Throws<System.ArgumentException>(() => new PollinationsAuth("not-a-publishable-key"));
        }

        [Test]
        public void MessageSerializesWithUnityJson()
        {
            var json = JsonUtility.ToJson(new PollinationsMessage("user", "hello"));
            StringAssert.Contains("\"role\":\"user\"", json);
            StringAssert.Contains("\"content\":\"hello\"", json);
        }
    }
}