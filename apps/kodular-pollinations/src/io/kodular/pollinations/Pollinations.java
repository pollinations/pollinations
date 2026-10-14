// Copyright 2025 Pollinations contributors
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// Pollinations AI extension for Kodular (and MIT App Inventor).
//
// Kodular compatibility notes (this extension is deliberately conservative):
//   * Extends AndroidNonvisibleComponent/Form/EventDispatcher/OnDestroyListener,
//     which have existed unchanged in both runtimes since 2013.
//   * No classes newer than the Kodular fork point, no @UsesLibraries, no
//     AndroidX, no external dependencies: only java.net, org.json (shipped
//     with Android) and android.* framework classes.
//   * Java 7 syntax only (no lambdas/streams), so the compiled classes pass
//     through any dx/d8 version used by the Kodular build server.
//   * Files are written to the app-scoped external files dir
//     (context.getExternalFilesDir), which needs no permissions on any
//     Android version. Relative paths given to Transcribe/PlaySpeech/
//     AskAboutImage are additionally resolved against Kodular's
//     /storage/emulated/0/Kodular/data and App Inventor's
//     /storage/emulated/0/AppInventor/data roots, so recordings made by
//     either toolchain can be read.
//   * All events are dispatched on the main thread via a
//     Handler(Looper.getMainLooper()); all network work happens on
//     background threads.

package io.kodular.pollinations;

import android.content.Context;
import android.content.Intent;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import com.google.appinventor.components.annotations.DesignerComponent;
import com.google.appinventor.components.annotations.DesignerProperty;
import com.google.appinventor.components.annotations.SimpleEvent;
import com.google.appinventor.components.annotations.SimpleFunction;
import com.google.appinventor.components.annotations.SimpleObject;
import com.google.appinventor.components.annotations.SimpleProperty;
import com.google.appinventor.components.annotations.PropertyCategory;
import com.google.appinventor.components.annotations.UsesPermissions;
import com.google.appinventor.components.common.ComponentCategory;
import com.google.appinventor.components.common.PropertyTypeConstants;
import com.google.appinventor.components.runtime.AndroidNonvisibleComponent;
import com.google.appinventor.components.runtime.ComponentContainer;
import com.google.appinventor.components.runtime.EventDispatcher;
import com.google.appinventor.components.runtime.OnDestroyListener;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Pollinations AI for Kodular.
 */
@DesignerComponent(
    version = 1,
    description = "Pollinations AI for Kodular: chat, image generation, speech, speech-to-text "
        + "and image questions from blocks. Users pay with their own Pollen using the built-in "
        + "Bring Your Own Pollen sign-in, so no secret API key ships inside your app. "
        + "Docs and sample project: apps/kodular-pollinations",
    category = ComponentCategory.EXTENSION,
    nonVisible = true,
    iconName = "images/pollinations.png")
@SimpleObject(external = true)
@UsesPermissions(permissionNames = "android.permission.INTERNET")
public class Pollinations extends AndroidNonvisibleComponent implements OnDestroyListener {

  // Pollinations endpoints.
  private static final String GEN_BASE = "https://gen.pollinations.ai";
  private static final String ENTER_BASE = "https://enter.pollinations.ai";

  // Defaults (empty block arguments fall back to these).
  private static final String DEFAULT_TEXT_MODEL = "openai/gpt-5.4-nano";
  private static final String DEFAULT_IMAGE_MODEL = "tongyi-mai/z-image-turbo";
  private static final String DEFAULT_TTS_MODEL = "openai/tts-1";
  private static final String DEFAULT_STT_MODEL = "whisper-large-v3";
  private static final String DEFAULT_VOICE = "alloy";

  // Shared-storage roots used by the two designers (see resolvePath).
  private static final String KODULAR_ASD = "/storage/emulated/0/Kodular/data";
  private static final String APPINVENTOR_ASD = "/storage/emulated/0/AppInventor/data";

  private static final String PREFS_NAME = "PollinationsBYOP";
  private static final String PREF_TOKEN = "user_token";

  private final Context context;
  private final Handler main = new Handler(Looper.getMainLooper());
  private final ExecutorService pool = Executors.newCachedThreadPool();

  /** Polls the Pollen device-flow token endpoint; replaced by each SignIn call. */
  private ScheduledExecutorService signInPoller;
  /** Key set manually with SetApiKey; wins over the stored Bring Your Own Pollen token. */
  private volatile String manualKey = "";
  /** Publishable App Key (pk_...) used to attribute sign-ins to this app. Not a secret. */
  private volatile String appKey = "";
  /** Media player used by PlaySpeech/StopSpeech. */
  private MediaPlayer player;

  public Pollinations(ComponentContainer container) {
    super(container.$form());
    context = container.$context();
    form.registerForOnDestroy(this);
  }

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  /**
   * Bring Your Own Pollen sign-in started. The browser has been opened on the
   * Pollinations approval page. Show the user code (and the verification URL,
   * in case the browser did not open) so the user can approve there.
   */
  @SimpleEvent(description = "SignIn() started: the approval page is open in the browser. "
      + "Show the user code to the user; they must approve there before SignedIn fires.")
  public void ShowVerificationCode(String verificationUri, String userCode) {
    EventDispatcher.dispatchEvent(this, "ShowVerificationCode", verificationUri, userCode);
  }

  /**
   * The user approved this app in the browser. userName is their Pollinations
   * username (empty when it could not be fetched). Requests now use their Pollen.
   */
  @SimpleEvent(description = "The user approved this app in the browser; requests now pay with "
      + "their own Pollen. userName is the Pollinations username when available.")
  public void SignedIn(String userName) {
    EventDispatcher.dispatchEvent(this, "SignedIn", userName);
  }

  /**
   * Sign-in failed: the user declined, the code expired, or the network failed.
   */
  @SimpleEvent(description = "Sign-in failed: declined by the user, expired, or a network error.")
  public void SignInFailed(String reason) {
    EventDispatcher.dispatchEvent(this, "SignInFailed", reason);
  }

  /**
   * Chat, ChatWithHistory and AskAboutImage answers arrive here.
   */
  @SimpleEvent(description = "Answer from Chat or ChatWithHistory.")
  public void GotChat(String response) {
    EventDispatcher.dispatchEvent(this, "GotChat", response);
  }

  /**
   * Something went wrong. function names the block that failed; message is a
   * readable reason (network error, HTTP status, Pollen balance, ...).
   */
  @SimpleEvent(description = "Any request failed. function names the block, message says why "
      + "(network error, sign-in required, insufficient Pollen, ...).")
  public void GotError(String function, String message) {
    EventDispatcher.dispatchEvent(this, "GotError", function, message);
  }

  /**
   * Generated image ready. filePath is an absolute path on the device that the
   * Kodular Image component can load directly (Picture property).
   */
  @SimpleEvent(description = "Generated image ready. filePath is an absolute path; set an Image "
      + "component's Picture property to it.")
  public void GotImage(String filePath) {
    EventDispatcher.dispatchEvent(this, "GotImage", filePath);
  }

  /**
   * Speech (mp3) ready. filePath is an absolute path; pass it to PlaySpeech.
   */
  @SimpleEvent(description = "Speech ready as an mp3 file. Play it with PlaySpeech(filePath).")
  public void GotSpeech(String filePath) {
    EventDispatcher.dispatchEvent(this, "GotSpeech", filePath);
  }

  /**
   * Transcription of the recording passed to Transcribe.
   */
  @SimpleEvent(description = "Transcription of the recording passed to Transcribe().")
  public void GotTranscription(String text) {
    EventDispatcher.dispatchEvent(this, "GotTranscription", text);
  }

  /**
   * Answer to AskAboutImage (vision).
   */
  @SimpleEvent(description = "Answer to AskAboutImage(prompt, imagePath).")
  public void GotImageAnswer(String answer) {
    EventDispatcher.dispatchEvent(this, "GotImageAnswer", answer);
  }

  /**
   * Model list for a category ("text", "image" or "audio") as a JSON array
   * string; decode with the JsonTextDecode block.
   */
  @SimpleEvent(description = "Model list as a JSON array string; decode it with the "
      + "JsonTextDecode block.")
  public void GotModels(String models) {
    EventDispatcher.dispatchEvent(this, "GotModels", models);
  }

  // ---------------------------------------------------------------------
  // Designer property: AppKey
  // ---------------------------------------------------------------------

  /**
   * Publishable App Key (starts with pk_) created at
   * https://enter.pollinations.ai/keys. It names your app on the sign-in
   * approval page and attributes traffic to you; it is not a secret and is
   * safe to ship inside the app. Leave empty to use an unattributed sign-in.
   */
  @DesignerProperty(editorType = PropertyTypeConstants.PROPERTY_TYPE_STRING,
      defaultValue = "")
  @SimpleProperty(category = PropertyCategory.BEHAVIOR,
      description = "Publishable App Key (pk_...) created at "
      + "https://enter.pollinations.ai/keys. Shown to users on the approval page; not a secret.")
  public void AppKey(String key) {
    this.appKey = key == null ? "" : key.trim();
  }

  @SimpleProperty(category = PropertyCategory.BEHAVIOR)
  public String AppKey() {
    return appKey;
  }

  // ---------------------------------------------------------------------
  // Sign-in (Bring Your Own Pollen device flow)
  // ---------------------------------------------------------------------

  /**
   * Starts the Bring Your Own Pollen device flow: opens the browser on the
   * Pollinations approval page and fires ShowVerificationCode immediately,
   * then SignedIn(userName) once the user approves or SignInFailed(reason)
   * if they decline, the code expires or something breaks. After SignedIn
   * the extension uses the user's own Pollen for requests, and no API key
   * ships inside the app. The authorization survives app restarts.
   */
  @SimpleFunction(description = "Opens the Pollinations approval page in the browser "
      + "(Bring Your Own Pollen device flow). Fires ShowVerificationCode right away, then "
      + "SignedIn(userName) after the user approves, or SignInFailed(reason). "
      + "Users pay with their own Pollen; no API key ships inside the app.")
  public void SignIn() {
    cancelSignIn();
    final String clientId = appKey;
    submit(new Runnable() {
      public void run() {
        try {
          JSONObject request = new JSONObject();
          request.put("client_id", clientId);
          JSONObject response = postJson(ENTER_BASE + "/api/device/code", request, null, false);
          if (!response.has("device_code")) {
            throw new ApiException(0, errorMessage(response, "device code request failed"));
          }
          final String deviceCode = response.getString("device_code");
          final String userCode = response.optString("user_code", "");
          String uri = response.optString("verification_uri_complete",
              response.optString("verification_uri", "https://enter.pollinations.ai/device"));
          final String verificationUri = uri;
          final long expiresAt = System.currentTimeMillis()
              + 1000L * response.optLong("expires_in", 1800);
          long interval = response.optLong("interval", 5);
          if (interval < 1) {
            interval = 5;
          }
          final ScheduledExecutorService poller = Executors.newSingleThreadScheduledExecutor();
          signInPoller = poller;
          post(new Runnable() {
            public void run() {
              openInBrowser(verificationUri);
              ShowVerificationCode(verificationUri, userCode);
            }
          });
          scheduleTokenPoll(poller, deviceCode, interval, expiresAt);
        } catch (final Exception e) {
          fireError("SignIn", e);
        }
      }
    });
  }

  /**
   * Stops the pending device-flow poller (if any) and forgets both the stored
   * Bring Your Own Pollen token and any key set with SetApiKey.
   */
  @SimpleFunction(description = "Forgets the stored user key and the key set with SetApiKey, "
      + "and cancels a pending sign-in. (Users can also revoke the key any time from "
      + "enter.pollinations.ai.)")
  public void SignOut() {
    cancelSignIn();
    manualKey = "";
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
        .remove(PREF_TOKEN).apply();
  }

  /**
   * Uses a Pollinations API key obtained outside the device flow (for example
   * your own sk_ key typed into a PasswordTextBox, or loaded from TinyDB).
   * It overrides a stored Bring Your Own Pollen token until SignOut. It is
   * kept in memory only and never written to disk by this extension.
   */
  @SimpleFunction(description = "Uses an API key obtained outside the device flow (typed by the "
      + "user, or loaded from TinyDB). Overrides the stored sign-in token until SignOut. "
      + "Kept in memory only; this extension never writes it to disk.")
  public void SetApiKey(String apiKey) {
    manualKey = apiKey == null ? "" : apiKey.trim();
  }

  /**
   * True when a request key is available: a stored Bring Your Own Pollen
   * token from SignIn, or a key set with SetApiKey.
   */
  @SimpleFunction(description = "True when a key is available: a stored sign-in token "
      + "or a key set with SetApiKey.")
  public boolean IsSignedIn() {
    return currentKey().length() > 0;
  }

  private void scheduleTokenPoll(final ScheduledExecutorService poller, final String deviceCode,
      final long intervalSeconds, final long expiresAt) {
    if (poller.isShutdown()) {
      return;
    }
    poller.schedule(new Runnable() {
      public void run() {
        if (poller.isShutdown()) {
          return;
        }
        if (System.currentTimeMillis() > expiresAt) {
          stopPoller();
          fireError("SignIn", new Exception("Sign-in expired before approval; call SignIn again."));
          return;
        }
        try {
          JSONObject request = new JSONObject();
          request.put("device_code", deviceCode);
          // The token endpoint answers 400 with {"error":"authorization_pending"}
          // while the user has not approved yet, so parse the body either way.
          JSONObject response = postJson(ENTER_BASE + "/api/device/token", request, null, true);
          if (response.has("access_token")) {
            stopPoller();
            storeToken(response.getString("access_token"));
            final String userName = fetchUserName();
            post(new Runnable() {
              public void run() {
                SignedIn(userName);
              }
            });
          } else if ("authorization_pending".equals(response.optString("error", ""))) {
            scheduleTokenPoll(poller, deviceCode, intervalSeconds, expiresAt);
          } else if ("slow_down".equals(response.optString("error", ""))) {
            scheduleTokenPoll(poller, deviceCode, intervalSeconds + 5, expiresAt);
          } else {
            stopPoller();
            String error = response.optString("error", "");
            String message = response.optString("error_description", "");
            if (message.length() == 0) {
              message = errorMessage(response, "sign-in failed");
            }
            if ("access_denied".equals(error) || "declined".equals(error)) {
              message = "Sign-in was denied in the browser.";
            }
            fireError("SignIn", new ApiException(0, message));
          }
        } catch (final Exception e) {
          stopPoller();
          fireError("SignIn", e);
        }
      }
    }, intervalSeconds, TimeUnit.SECONDS);
  }

  private String fetchUserName() {
    try {
      JSONObject info = getJson(ENTER_BASE + "/api/device/userinfo", currentKey());
      String name = info.optString("preferred_username", "");
      if (name.length() == 0) {
        name = info.optString("name", "");
      }
      return name;
    } catch (Exception ignored) {
      return ""; // username is optional; the token itself is fine
    }
  }

  private synchronized void stopPoller() {
    if (signInPoller != null) {
      signInPoller.shutdownNow();
      signInPoller = null;
    }
  }

  private synchronized void cancelSignIn() {
    if (signInPoller != null) {
      signInPoller.shutdownNow();
      signInPoller = null;
    }
  }

  private void storeToken(String token) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
        .putString(PREF_TOKEN, token).apply();
  }

  private String storedToken() {
    return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getString(PREF_TOKEN, "");
  }

  /** Manual key first, then the stored Bring Your Own Pollen token. */
  private String currentKey() {
    if (manualKey.length() > 0) {
      return manualKey;
    }
    return storedToken();
  }

  private void openInBrowser(String url) {
    try {
      Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
      browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      context.startActivity(browserIntent);
    } catch (Exception ignored) {
      // No browser available: ShowVerificationCode already gave the user
      // the URL and code so they can open it on any device.
    }
  }

  // ---------------------------------------------------------------------
  // Text
  // ---------------------------------------------------------------------

  /**
   * Sends the prompt to a Pollinations text model and fires GotChat with the
   * answer. An empty model uses "openai/gpt-5.4-nano".
   */
  @SimpleFunction(description = "Asks a Pollinations text model. An empty model uses "
      + "\"openai/gpt-5.4-nano\". The answer arrives in GotChat(response).")
  public void Chat(final String prompt, String model) {
    final String chosen = defaultString(model, DEFAULT_TEXT_MODEL);
    submit(new Runnable() {
      public void run() {
        try {
          JSONArray messages = new JSONArray();
          messages.put(new JSONObject().put("role", "user").put("content", prompt));
          JSONObject answer = chatCompletion(messages, chosen);
          final String reply = extractReply(answer);
          post(new Runnable() {
            public void run() {
              GotChat(reply);
            }
          });
        } catch (final Exception e) {
          fireError("Chat", e);
        }
      }
    });
  }

  /**
   * Like Chat, but with the conversation so far. historyJson is a JSON array
   * of {"role":"user"|"assistant","content":"..."} objects, for example
   * [{"role":"user","content":"My name is Ada"},{"role":"assistant","content":"Hi Ada!"}].
   * The prompt is appended as the newest user message; the answer arrives in
   * GotChat.
   */
  @SimpleFunction(description = "Like Chat but with the conversation so far: historyJson is a "
      + "JSON array like [{\"role\":\"user\",\"content\":\"My name is Ada\"},"
      + "{\"role\":\"assistant\",\"content\":\"Hi Ada!\"}]. The prompt is appended and the "
      + "answer arrives in GotChat(response).")
  public void ChatWithHistory(final String prompt, final String historyJson, String model) {
    final String chosen = defaultString(model, DEFAULT_TEXT_MODEL);
    submit(new Runnable() {
      public void run() {
        try {
          JSONArray history = new JSONArray(
              defaultString(historyJson, "").length() == 0 ? "[]" : historyJson);
          JSONArray messages = new JSONArray();
          for (int i = 0; i < history.length(); i++) {
            JSONObject entry = history.getJSONObject(i);
            String role = entry.optString("role", "");
            if (!"user".equals(role) && !"assistant".equals(role) && !"system".equals(role)) {
              throw new ApiException(0, "historyJson entry " + i
                  + " has a role other than user, assistant or system.");
            }
            if (!(entry.opt("content") instanceof String)) {
              throw new ApiException(0, "historyJson entry " + i + " has no string content.");
            }
            messages.put(new JSONObject()
                .put("role", role)
                .put("content", entry.getString("content")));
          }
          messages.put(new JSONObject().put("role", "user").put("content", prompt));
          JSONObject answer = chatCompletion(messages, chosen);
          final String reply = extractReply(answer);
          post(new Runnable() {
            public void run() {
              GotChat(reply);
            }
          });
        } catch (final Exception e) {
          fireError("ChatWithHistory", e);
        }
      }
    });
  }

  /**
   * Asks the default vision-capable text model about an image file on the
   * device and fires GotImageAnswer with the answer. Works with the absolute
   * path from GotImage, with paths returned by the Kodular SoundRecorder/
   * File components, and with content:// URIs from pickers.
   */
  @SimpleFunction(description = "Asks about an image: prompt like \"Describe this image\" plus "
      + "the path to an image file (the path from GotImage, from the camera/gallery, or a "
      + "content:// URI from a picker). The answer arrives in GotImageAnswer(answer).")
  public void AskAboutImage(final String prompt, final String imagePath) {
    submit(new Runnable() {
      public void run() {
        try {
          byte[] bytes = readAllBytes(imagePath);
          String dataUri = "data:" + imageMime(imagePath) + ";base64,"
              + Base64.encodeToString(bytes, Base64.NO_WRAP);
          JSONArray content = new JSONArray();
          content.put(new JSONObject()
              .put("type", "text")
              .put("text", defaultString(prompt, "Describe this image.")));
          content.put(new JSONObject()
              .put("type", "image_url")
              .put("image_url", new JSONObject().put("url", dataUri)));
          JSONArray messages = new JSONArray();
          messages.put(new JSONObject().put("role", "user").put("content", content));
          JSONObject answer = chatCompletion(messages, DEFAULT_TEXT_MODEL);
          final String reply = extractReply(answer);
          post(new Runnable() {
            public void run() {
              GotImageAnswer(reply);
            }
          });
        } catch (final Exception e) {
          fireError("AskAboutImage", e);
        }
      }
    });
  }

  private JSONObject chatCompletion(JSONArray messages, String model) throws Exception {
    JSONObject body = new JSONObject();
    body.put("model", model);
    body.put("messages", messages);
    return postJson(GEN_BASE + "/v1/chat/completions", body, currentKey(), false);
  }

  private static String extractReply(JSONObject response) throws Exception {
    JSONArray choices = response.optJSONArray("choices");
    if (choices == null || choices.length() == 0) {
      throw new ApiException(0, errorMessage(response, "empty response from the model"));
    }
    JSONObject message = choices.getJSONObject(0).optJSONObject("message");
    if (message == null || message.isNull("content")) {
      return "";
    }
    Object content = message.get("content");
    return content instanceof String ? (String) content : String.valueOf(content);
  }

  // ---------------------------------------------------------------------
  // Images
  // ---------------------------------------------------------------------

  /**
   * Generates an image for the prompt and fires GotImage(filePath) with an
   * absolute path that the Kodular Image component can load. Empty model uses
   * "tongyi-mai/z-image-turbo"; width and height are pixels (<= 0 uses 1024).
   * Image generation needs a signed-in user (SignIn) or a key (SetApiKey),
   * otherwise GotError explains it.
   */
  @SimpleFunction(description = "Generates an image for the prompt. Empty model uses "
      + "\"tongyi-mai/z-image-turbo\"; width/height are pixels (<= 0 uses 1024). Needs a "
      + "signed-in user or SetApiKey; the result arrives in GotImage(filePath) as an absolute "
      + "path the Image component can load.")
  public void GenerateImage(final String prompt, String model, final int width, final int height) {
    final String chosen = defaultString(model, DEFAULT_IMAGE_MODEL);
    final int w = width <= 0 ? 1024 : width;
    final int h = height <= 0 ? 1024 : height;
    submit(new Runnable() {
      public void run() {
        try {
          String url = GEN_BASE + "/image/" + urlPathSegment(prompt)
              + "?model=" + urlQueryValue(chosen)
              + "&width=" + w
              + "&height=" + h;
          BinaryResponse response = getBinary(url, currentKey());
          if (response.contentType.contains("json")) {
            JSONObject error = new JSONObject(new String(response.bytes, "UTF-8"));
            throw new ApiException(200, errorMessage(error, "image generation failed"));
          }
          final String path = saveFile("pollinations_image",
              extensionFor(response.contentType, ".png"), response.bytes);
          post(new Runnable() {
            public void run() {
              GotImage(path);
            }
          });
        } catch (final Exception e) {
          fireError("GenerateImage", e);
        }
      }
    });
  }

  // ---------------------------------------------------------------------
  // Speech
  // ---------------------------------------------------------------------

  /**
   * Speaks the text with a Pollinations voice and fires GotSpeech(filePath)
   * with the saved mp3. Empty voice uses "alloy". Feed the path to PlaySpeech
   * or any player component.
   */
  @SimpleFunction(description = "Turns text into speech (mp3). Empty voice uses \"alloy\"; other "
      + "voices include \"echo\", \"fable\", \"onyx\", \"nova\" and \"shimmer\". The file "
      + "arrives in GotSpeech(filePath); play it with PlaySpeech.")
  public void Speak(final String text, String voice) {
    final String chosenVoice = defaultString(voice, DEFAULT_VOICE);
    submit(new Runnable() {
      public void run() {
        try {
          JSONObject body = new JSONObject();
          body.put("model", DEFAULT_TTS_MODEL);
          body.put("voice", chosenVoice);
          body.put("input", text);
          BinaryResponse response = postBinary(GEN_BASE + "/v1/audio/speech", body, currentKey());
          if (response.contentType.contains("json")) {
            JSONObject error = new JSONObject(new String(response.bytes, "UTF-8"));
            throw new ApiException(200, errorMessage(error, "speech generation failed"));
          }
          final String path = saveFile("pollinations_speech",
              extensionFor(response.contentType, ".mp3"), response.bytes);
          post(new Runnable() {
            public void run() {
              GotSpeech(path);
            }
          });
        } catch (final Exception e) {
          fireError("Speak", e);
        }
      }
    });
  }

  /**
   * Plays an audio file with the device media player - for example the mp3
   * path from GotSpeech. StopSpeech stops playback.
   */
  @SimpleFunction(description = "Plays an audio file, for example the mp3 from GotSpeech. "
      + "StopSpeech() stops it.")
  public void PlaySpeech(final String filePath) {
    submit(new Runnable() {
      public void run() {
        try {
          final MediaPlayer newPlayer = new MediaPlayer();
          String path = resolvePath(filePath);
          if (path.startsWith("content://")) {
            newPlayer.setDataSource(context, Uri.parse(path));
          } else {
            newPlayer.setDataSource(path);
          }
          newPlayer.prepare();
          newPlayer.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
            public void onCompletion(MediaPlayer finished) {
              releasePlayer(newPlayer);
              finished.release();
            }
          });
          synchronized (this) {
            if (player != null && player != newPlayer) {
              releasePlayer(player);
            }
            player = newPlayer;
          }
          newPlayer.start();
        } catch (final Exception e) {
          fireError("PlaySpeech", e);
        }
      }
    });
  }

  /**
   * Stops playback started by PlaySpeech (no effect when nothing plays).
   */
  @SimpleFunction(description = "Stops and releases playback started by PlaySpeech.")
  public void StopSpeech() {
    submit(new Runnable() {
      public void run() {
        synchronized (this) {
          if (player != null) {
            releasePlayer(player);
            player = null;
          }
        }
      }
    });
  }

  private void releasePlayer(MediaPlayer toRelease) {
    synchronized (this) {
      if (player == toRelease) {
        player = null;
      }
    }
    try {
      if (toRelease.isPlaying()) {
        toRelease.stop();
      }
    } catch (IllegalStateException ignored) {
      // already stopped
    }
    toRelease.release();
  }

  // ---------------------------------------------------------------------
  // Speech-to-text
  // ---------------------------------------------------------------------

  /**
   * Transcribes a recording with Pollinations speech-to-text and fires
   * GotTranscription(text). Pass the path from the Kodular SoundRecorder's
   * AfterSoundRecorded event, any audio file path, or a content:// URI from
   * a picker.
   */
  @SimpleFunction(description = "Transcribes a recording: pass the path from the SoundRecorder's "
      + "AfterSoundRecorded event, any audio file path, or a content:// URI from a picker. "
      + "The text arrives in GotTranscription(text).")
  public void Transcribe(final String recordingPath) {
    submit(new Runnable() {
      public void run() {
        try {
          final String text = transcribe(recordingPath);
          post(new Runnable() {
            public void run() {
              GotTranscription(text);
            }
          });
        } catch (final Exception e) {
          fireError("Transcribe", e);
        }
      }
    });
  }

  private String transcribe(String path) throws Exception {
    byte[] audio = readAllBytes(path);
    String resolved = resolvePath(path);
    String fileName = "recording" + defaultString(fileExtension(resolved), ".m4a");
    String boundary = "----Pollinations" + Long.toHexString(System.currentTimeMillis());

    ByteArrayOutputStream body = new ByteArrayOutputStream();
    writeAscii(body, "--" + boundary + "\r\n"
        + "Content-Disposition: form-data; name=\"file\"; filename=\"" + fileName + "\"\r\n"
        + "Content-Type: " + audioMime(resolved) + "\r\n\r\n");
    body.write(audio);
    writeAscii(body, "\r\n--" + boundary + "\r\n"
        + "Content-Disposition: form-data; name=\"model\"\r\n\r\n"
        + DEFAULT_STT_MODEL + "\r\n--" + boundary + "--\r\n");

    HttpURLConnection connection = open(GEN_BASE + "/v1/audio/transcriptions", "POST");
    connection.setConnectTimeout(15000);
    connection.setReadTimeout(180000);
    connection.setDoOutput(true);
    connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
    String auth = currentKey();
    if (auth.length() > 0) {
      connection.setRequestProperty("Authorization", "Bearer " + auth);
    }
    OutputStream out = connection.getOutputStream();
    try {
      out.write(body.toByteArray());
    } finally {
      out.close();
    }
    int status = connection.getResponseCode();
    String responseBody = readBody(status, connection);
    if (status / 100 != 2) {
      throw new ApiException(status, errorMessage(tryParseJson(responseBody),
          "transcription failed (HTTP " + status + ")"));
    }
    JSONObject parsed = new JSONObject(responseBody);
    if (parsed.has("error") && !parsed.isNull("error")) {
      throw new ApiException(status, errorMessage(parsed, "transcription failed"));
    }
    return parsed.optString("text", "");
  }

  // ---------------------------------------------------------------------
  // Models
  // ---------------------------------------------------------------------

  /**
   * Fetches the list of available models for a category - "text", "image" or
   * "audio" - and fires GotModels with a JSON array string. Use the model
   * names (the "name" field) with Chat and GenerateImage.
   */
  @SimpleFunction(description = "Fetches the model list for a category: \"text\", \"image\" or "
      + "\"audio\". Arrives in GotModels as a JSON array string; decode it with the "
      + "JsonTextDecode block and use the \"name\" fields in Chat/GenerateImage.")
  public void ListModels(String category) {
    final String cat = defaultString(category, "text").trim().toLowerCase();
    submit(new Runnable() {
      public void run() {
        try {
          if (!cat.equals("text") && !cat.equals("image") && !cat.equals("audio")) {
            throw new ApiException(0, "category must be \"text\", \"image\" or \"audio\"");
          }
          final String models = rawGet(GEN_BASE + "/" + cat + "/models", currentKey());
          post(new Runnable() {
            public void run() {
              GotModels(models);
            }
          });
        } catch (final Exception e) {
          fireError("ListModels", e);
        }
      }
    });
  }

  // ---------------------------------------------------------------------
  // Networking (java.net only)
  // ---------------------------------------------------------------------

  private static class ApiException extends Exception {
    final int status;

    ApiException(int status, String message) {
      super(message);
      this.status = status;
    }
  }

  private static class BinaryResponse {
    final byte[] bytes;
    final String contentType;

    BinaryResponse(byte[] bytes, String contentType) {
      this.bytes = bytes;
      this.contentType = contentType;
    }
  }

  private static HttpURLConnection open(String url, String method) throws IOException {
    HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
    connection.setRequestMethod(method);
    connection.setInstanceFollowRedirects(true);
    connection.setRequestProperty("Accept", "application/json, */*");
    return connection;
  }

  private static String readBody(int status, HttpURLConnection connection) throws IOException {
    InputStream stream = null;
    try {
      stream = status / 100 == 2 ? connection.getInputStream() : connection.getErrorStream();
      if (stream == null) {
        return "";
      }
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      byte[] buffer = new byte[8192];
      int read;
      while ((read = stream.read(buffer)) > 0) {
        out.write(buffer, 0, read);
      }
      return new String(out.toByteArray(), "UTF-8");
    } finally {
      if (stream != null) {
        stream.close();
      }
    }
  }

  private static void writeAscii(OutputStream out, String text) throws IOException {
    out.write(text.getBytes("UTF-8"));
  }

  private static JSONObject tryParseJson(String text) {
    try {
      return new JSONObject(text);
    } catch (Exception ignored) {
      return null;
    }
  }

  /** Pulls a human-readable message out of either error shape Pollinations uses. */
  private static String errorMessage(JSONObject error, String fallback) {
    if (error == null) {
      return fallback;
    }
    try {
      if (error.has("error")) {
        Object inner = error.get("error");
        if (inner instanceof String) {
          return (String) inner;
        }
        JSONObject errorObject = (JSONObject) inner;
        String message = errorObject.optString("message",
            errorObject.optString("error_description", ""));
        if (message.length() == 0) {
          message = errorObject.optString("error_description", "");
        }
        return message.length() > 0 ? message : fallback;
      }
      if (error.has("message")) {
        return error.getString("message");
      }
      if (error.has("error_description")) {
        return error.getString("error_description");
      }
    } catch (Exception ignored) {
      // fall through to the fallback
    }
    return fallback;
  }

  /**
   * POSTs a JSON body. With lenient=true the body is returned even for error
   * statuses, so callers can inspect OAuth error fields like
   * "authorization_pending".
   */
  private JSONObject postJson(String url, JSONObject body, String bearer, boolean lenient)
      throws Exception {
    HttpURLConnection connection = open(url, "POST");
    connection.setConnectTimeout(15000);
    connection.setReadTimeout(60000);
    connection.setDoOutput(true);
    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
    if (bearer != null && bearer.length() > 0) {
      connection.setRequestProperty("Authorization", "Bearer " + bearer);
    }
    OutputStream out = connection.getOutputStream();
    try {
      writeAscii(out, body.toString());
    } finally {
      out.close();
    }
    int status = connection.getResponseCode();
    String response = readBody(status, connection);
    JSONObject parsed = tryParseJson(response);
    if (status / 100 == 2) {
      return parsed != null ? parsed : new JSONObject();
    }
    if (lenient && parsed != null) {
      return parsed;
    }
    throw new ApiException(status, errorMessage(parsed,
        "request failed (HTTP " + status + ")"));
  }

  private JSONObject getJson(String url, String bearer) throws Exception {
    HttpURLConnection connection = open(url, "GET");
    connection.setConnectTimeout(15000);
    connection.setReadTimeout(30000);
    if (bearer != null && bearer.length() > 0) {
      connection.setRequestProperty("Authorization", "Bearer " + bearer);
    }
    int status = connection.getResponseCode();
    String response = readBody(status, connection);
    JSONObject parsed = tryParseJson(response);
    if (status / 100 == 2 && parsed != null) {
      return parsed;
    }
    throw new ApiException(status, errorMessage(parsed, "request failed (HTTP " + status + ")"));
  }

  private String rawGet(String url, String bearer) throws Exception {
    HttpURLConnection connection = open(url, "GET");
    connection.setConnectTimeout(15000);
    connection.setReadTimeout(60000);
    if (bearer != null && bearer.length() > 0) {
      connection.setRequestProperty("Authorization", "Bearer " + bearer);
    }
    int status = connection.getResponseCode();
    String response = readBody(status, connection);
    if (status / 100 == 2) {
      return response;
    }
    throw new ApiException(status, errorMessage(tryParseJson(response),
        "request failed (HTTP " + status + ")"));
  }

  private BinaryResponse getBinary(String url, String bearer) throws Exception {
    HttpURLConnection connection = open(url, "GET");
    connection.setConnectTimeout(20000);
    connection.setReadTimeout(300000); // image generation can take a while
    if (bearer != null && bearer.length() > 0) {
      connection.setRequestProperty("Authorization", "Bearer " + bearer);
    }
    int status = connection.getResponseCode();
    if (status / 100 != 2) {
      String response = readBody(status, connection);
      throw new ApiException(status, errorMessage(tryParseJson(response),
          "request failed (HTTP " + status + ")"));
    }
    InputStream stream = connection.getInputStream();
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    try {
      byte[] buffer = new byte[8192];
      int read;
      while ((read = stream.read(buffer)) > 0) {
        out.write(buffer, 0, read);
      }
    } finally {
      stream.close();
    }
    String type = connection.getContentType();
    return new BinaryResponse(out.toByteArray(), type == null ? "" : type.toLowerCase());
  }

  private BinaryResponse postBinary(String url, JSONObject body, String bearer) throws Exception {
    HttpURLConnection connection = open(url, "POST");
    connection.setConnectTimeout(20000);
    connection.setReadTimeout(180000);
    connection.setDoOutput(true);
    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
    if (bearer != null && bearer.length() > 0) {
      connection.setRequestProperty("Authorization", "Bearer " + bearer);
    }
    OutputStream out = connection.getOutputStream();
    try {
      writeAscii(out, body.toString());
    } finally {
      out.close();
    }
    int status = connection.getResponseCode();
    InputStream stream = status / 100 == 2 ? connection.getInputStream()
        : connection.getErrorStream();
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    if (stream != null) {
      try {
        byte[] buffer = new byte[8192];
        int read;
        while ((read = stream.read(buffer)) > 0) {
          bytes.write(buffer, 0, read);
        }
      } finally {
        stream.close();
      }
    }
    String type = connection.getContentType();
    if (status / 100 != 2 || (type != null && type.toLowerCase().contains("json"))) {
      throw new ApiException(status, errorMessage(tryParseJson(bytes.toString("UTF-8")),
          "request failed (HTTP " + status + ")"));
    }
    return new BinaryResponse(bytes.toByteArray(), type == null ? "" : type.toLowerCase());
  }

  // ---------------------------------------------------------------------
  // Files and paths
  // ---------------------------------------------------------------------

  /**
   * App-scoped external files dir (no permissions needed on any Android
   * version), falling back to the internal files dir when external storage
   * is unavailable.
   */
  private File storageDir() {
    File dir = context.getExternalFilesDir(null);
    if (dir == null) {
      dir = context.getFilesDir();
    }
    if (!dir.exists()) {
      dir.mkdirs();
    }
    return dir;
  }

  private String saveFile(String baseName, String extension, byte[] bytes) throws IOException {
    File file = new File(storageDir(), baseName + "_" + System.currentTimeMillis() + extension);
    FileOutputStream out = new FileOutputStream(file);
    try {
      out.write(bytes);
    } finally {
      out.close();
    }
    return file.getAbsolutePath();
  }

  /**
   * Kodular-safe path resolution.
   *
   * Accepts absolute paths, file:// URLs and content:// URIs as-is, and
   * resolves relative paths against, in order: this app's external files
   * dir, Kodular's shared data root (/storage/emulated/0/Kodular/data) and
   * App Inventor's (/storage/emulated/0/AppInventor/data). This is what makes
   * the extension work with recordings made by either designer's
   * SoundRecorder/File components.
   */
  private String resolvePath(String path) {
    String trimmed = path == null ? "" : path.trim();
    if (trimmed.startsWith("file://")) {
      return trimmed.substring("file://".length());
    }
    if (trimmed.startsWith("content://") || trimmed.startsWith("/")) {
      return trimmed;
    }
    if (trimmed.length() == 0) {
      return trimmed;
    }
    String[] candidates = new String[] {
        new File(storageDir(), trimmed).getAbsolutePath(),
        KODULAR_ASD + "/" + trimmed,
        APPINVENTOR_ASD + "/" + trimmed
    };
    for (String candidate : candidates) {
      if (new File(candidate).exists()) {
        return candidate;
      }
    }
    return candidates[0];
  }

  private byte[] readAllBytes(String path) throws IOException {
    String resolved = resolvePath(path);
    if (resolved.startsWith("content://")) {
      InputStream stream = context.getContentResolver().openInputStream(Uri.parse(resolved));
      if (stream == null) {
        throw new FileNotFoundException(path);
      }
      try {
        return drain(stream);
      } finally {
        stream.close();
      }
    }
    File file = new File(resolved);
    if (!file.exists() && !path.equals(resolved)) {
      // try the original spelling before giving up
      File original = new File(path.trim());
      if (original.exists()) {
        file = original;
      }
    }
    InputStream in = new FileInputStream(file);
    try {
      return drain(in);
    } finally {
      in.close();
    }
  }

  private static byte[] drain(InputStream stream) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] buffer = new byte[8192];
    int read;
    while ((read = stream.read(buffer)) > 0) {
      out.write(buffer, 0, read);
    }
    return out.toByteArray();
  }

  private static String fileExtension(String path) {
    String name = new File(path).getName();
    int dot = name.lastIndexOf('.');
    if (dot < 0 || dot == name.length() - 1) {
      return "";
    }
    return name.substring(dot);
  }

  private static String imageMime(String path) {
    String extension = fileExtension(path).toLowerCase();
    if (extension.equals(".png")) {
      return "image/png";
    }
    if (extension.equals(".webp")) {
      return "image/webp";
    }
    if (extension.equals(".gif")) {
      return "image/gif";
    }
    if (extension.equals(".bmp")) {
      return "image/bmp";
    }
    return "image/jpeg";
  }

  private static String audioMime(String path) {
    String extension = fileExtension(path).toLowerCase();
    if (extension.equals(".mp3")) {
      return "audio/mpeg";
    }
    if (extension.equals(".wav")) {
      return "audio/wav";
    }
    if (extension.equals(".3gp")) {
      return "audio/3gpp";
    }
    if (extension.equals(".amr")) {
      return "audio/amr";
    }
    if (extension.equals(".aac")) {
      return "audio/aac";
    }
    if (extension.equals(".ogg")) {
      return "audio/ogg";
    }
    if (extension.equals(".webm")) {
      return "audio/webm";
    }
    return "audio/mp4"; // .m4a/.mp4 and everything else recorded on phones
  }

  private static String extensionFor(String contentType, String fallback) {
    String type = contentType == null ? "" : contentType.toLowerCase().split(";")[0].trim();
    if (type.contains("png")) {
      return ".png";
    }
    if (type.contains("jpeg") || type.contains("jpg")) {
      return ".jpg";
    }
    if (type.contains("webp")) {
      return ".webp";
    }
    if (type.contains("gif")) {
      return ".gif";
    }
    if (type.contains("mpeg") || type.contains("mp3")) {
      return ".mp3";
    }
    if (type.contains("wav")) {
      return ".wav";
    }
    if (type.contains("ogg")) {
      return ".ogg";
    }
    return fallback;
  }

  private static String urlPathSegment(String text) throws IOException {
    return URLEncoder.encode(defaultString(text, ""), "UTF-8").replace("+", "%20");
  }

  private static String urlQueryValue(String text) throws IOException {
    return URLEncoder.encode(defaultString(text, ""), "UTF-8");
  }

  private static String defaultString(String value, String fallback) {
    if (value == null) {
      return fallback;
    }
    String trimmed = value.trim();
    return trimmed.length() == 0 ? fallback : trimmed;
  }

  // ---------------------------------------------------------------------
  // Error reporting
  // ---------------------------------------------------------------------

  private void post(Runnable runnable) {
    main.post(runnable);
  }

  private void submit(Runnable runnable) {
    try {
      pool.execute(runnable);
    } catch (RejectedExecutionException ignored) {
      // App is being destroyed; nothing to do.
    }
  }

  private void fireError(final String function, final Exception e) {
    final String message = friendlyError(e);
    post(new Runnable() {
      public void run() {
        GotError(function, message);
      }
    });
  }

  /** Maps common failures to actionable advice without hiding the cause. */
  private static String friendlyError(Exception e) {
    String message = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
    if (e instanceof ApiException) {
      switch (((ApiException) e).status) {
        case 401:
          return message + " - sign in with SignIn() (the user pays with their own Pollen) "
              + "or set a key with SetApiKey().";
        case 402:
          return message + " - the Pollen balance or budget is too low for this request.";
        case 429:
          return message + " - rate limited; wait a moment and retry.";
        default:
          return message;
      }
    }
    if (e instanceof FileNotFoundException) {
      return "File not found: " + message;
    }
    if (e instanceof java.net.UnknownHostException || e instanceof java.net.ConnectException
        || e instanceof java.net.SocketTimeoutException || e instanceof IOException) {
      return "Network error: " + message;
    }
    return message;
  }

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  @Override
  public void onDestroy() {
    cancelSignIn();
    pool.shutdownNow();
    synchronized (this) {
      if (player != null) {
        releasePlayer(player);
        player = null;
      }
    }
  }
}
