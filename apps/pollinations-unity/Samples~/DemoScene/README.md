# Pollinations Unity demo

1. Add this package to a Unity 2021.3+ project.
2. Create a Canvas with a `RawImage` and a `Text`, plus an `AudioSource`.
3. Create an empty GameObject and add `PollinationsDemo`.
4. Assign the three UI/audio references and a development `sk_...` key in the Inspector.
5. Use the component context menu **Run Pollinations demo**.

For a player-funded build, leave `ApiKey` empty, run `PollinationsAuth` with your
publishable `pk_...` App Key, and assign the returned `AccessToken` to
`PollinationsClient.DeviceToken`. Device-flow tokens stay in memory; do not serialize
them or place development keys in a scene, prefab, or build.