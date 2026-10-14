// Pollinations extension for MIT App Inventor
//
// Adds text (chat), image generation, text-to-speech, speech-to-text and
// vision ("ask about an image") blocks backed by https://gen.pollinations.ai.
//
// Users sign in with the Pollinations device flow (Bring Your Own Pollen),
// so no API key ships inside the app. A manual key can also be set with
// SetApiKey. See the README for block-by-block usage.
//
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 pollinations.ai

package appinventor.ai_pollinations;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
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
import com.google.appinventor.components.annotations.PropertyCategory;
import com.google.appinventor.components.annotations.SimpleProperty;
import com.google.appinventor.components.annotations.UsesPermissions;
import com.google.appinventor.components.common.ComponentCategory;
import com.google.appinventor.components.common.PropertyTypeConstants;
import com.google.appinventor.components.runtime.AndroidNonvisibleComponent;
import com.google.appinventor.components.runtime.ComponentContainer;
import com.google.appinventor.components.runtime.EventDispatcher;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Pollinations AI: chat, images, speech, speech-to-text and vision.
 *
 * <p>All network calls run on a background thread and results come back
 * through events on the main thread, so blocks never block the UI.</p>
 *
 * <p>Speech-to-text (multipart upload of a recording) and asking questions
 * about an image (multimodal chat request) are the two things the built-in
 * Web component cannot do well.</p>
 *
 * <p>Sign-in uses the Pollinations device flow (Bring Your Own Pollen): the
 * app opens the verification page in the browser, the user approves with
 * their own account, and the app receives a scoped key. No API key ships
 * inside the app, and users pay with their own Pollen.</p>
 */
@DesignerComponent(
    version = 1,
    versionName = "1.0",
    dateBuilt = "2026-10-14",
    description = "Pollinations AI: text, images, speech, speech-to-text and vision.<br>" +
        "<p><b>Sign-in</b>: call <code>SignIn</code> once. The app's user approves in " +
        "the browser with their own Pollinations account, so no API key ships inside " +
        "your app and users pay with their own Pollen. Or set a key manually with " +
        "<code>SetApiKey</code>.</p>" +
        "<p><b>Blocks</b>: <code>Chat</code>, <code>ChatWithHistory</code>, " +
        "<code>GenerateImage</code>, <code>Speak</code>/<code>SpeakAndPlay</code>, " +
        "<code>Transcribe</code> (speech-to-text from a recording), " +
        "<code>AskAboutImage</code> (vision), <code>ListModels</code>.</p>",
    category = ComponentCategory.EXTENSION,
    nonVisible = true,
    iconName = "images/pollinations.png",
    licenseName = "LICENSE",
    androidMinSdk = 21)
@SimpleObject(external = true)
@UsesPermissions(permissionNames = "android.permission.INTERNET")
public class Pollinations extends AndroidNonvisibleComponent {

  private static final String LOG_TAG = "Pollinations";

  /** API base for generation (text, images, speech, transcription). */
  private static final String GEN_BASE = "https://gen.pollinations.ai";

  /** Device-flow endpoints (Bring Your Own Pollen). */
  private static final String ENTER_BASE = "https://enter.pollinations.ai";

  /** Files created by this extension live in this folder of the app's own
   *  external storage (the App Inventor "App" file scope). No permissions
   *  are needed and the built-in Image and Player components can read them. */
  private static final String OUTPUT_DIR = "Pollinations";

  private static final int CONNECT_TIMEOUT_MS = 20000;
  private static final int READ_TIMEOUT_MS = 300000;

  private static final String DEFAULT_TEXT_MODEL = "openai/gpt-5.4-nano";
  private static final String DEFAULT_IMAGE_MODEL = "tongyi-mai/z-image-turbo";
  private static final String DEFAULT_SPEECH_MODEL = "openai/tts-1";
  private static final String DEFAULT_VOICE = "alloy";

  /** Name of the app-private file remembering the signed-in key. */
  private static final String TOKEN_FILE = "pollinations_device_token.txt";

  /** Serialized background worker. One request at a time; results on the UI thread. */
  private final ExecutorService apiExecutor = Executors.newSingleThreadExecutor();

  /** Background worker dedicated to polling the device-flow token endpoint. */
  private final ExecutorService deviceFlowExecutor = Executors.newSingleThreadExecutor();

  /** Posts events back to the App Inventor (main) thread. */
  private final Handler uiHandler = new Handler(Looper.getMainLooper());

  /** Guards the device flow: only the newest flow may poll. */
  private final AtomicLong deviceFlowGeneration = new AtomicLong(0);

  private final Context context;

  /** The signed-in user key (sk_...) or a key set with SetApiKey. */
  private String accessToken;

  /** Set once the stored key was loaded (or deliberately not loaded). */
  private boolean tokenLoaded = false;

  /** Plays speech produced by SpeakAndPlay. */
  private MediaPlayer mediaPlayer;

  // ---------------------------------------------------------------------
  // Properties

  private String appKey = "";
  private boolean rememberSignIn = true;
  private String textModel = DEFAULT_TEXT_MODEL;
  private String imageModel = DEFAULT_IMAGE_MODEL;
  private String speechModel = DEFAULT_SPEECH_MODEL;
  private String voice = DEFAULT_VOICE;

  public Pollinations(ComponentContainer container) {
    super(container.$form());
    context = container.$context();
  }

  /**
   * Optional publishable App Key (`pk_...`) used during `SignIn` so the
   * consent screen shows your app's name and attributes traffic to your
   * account. Create one at https://enter.pollinations.ai/keys. Leave empty
   * for no attribution.
   *
   * @param appKey the publishable App Key, or "" for none
   */
  @DesignerProperty(editorType = PropertyTypeConstants.PROPERTY_TYPE_STRING,
      defaultValue = "")
  @SimpleProperty(category = PropertyCategory.BEHAVIOR,
      description = "Optional publishable App Key (pk_...) used by SignIn "
      + "for attribution on the consent screen. Create one at enter.pollinations.ai/keys. "
      + "Leave empty if you do not have one.")
  public void AppKey(String appKey) {
    this.appKey = trimToEmpty(appKey);
  }

  /**
   * Returns the App Key used by SignIn.
   *
   * @return the App Key, or "" if unset
   */
  @SimpleProperty(category = PropertyCategory.BEHAVIOR)
  public String AppKey() {
    return appKey;
  }

  /**
   * If true (default), the key received from SignIn is kept in the app's
   * private storage so the user stays signed in across app restarts. If
   * false, the key is kept in memory only and is gone when the app closes.
   * The key is stored in the app's private, sandboxed directory; it is never
   * shipped with the app and is removed by SignOut.
   *
   * @param remember true to persist the signed-in key
   */
  @DesignerProperty(editorType = PropertyTypeConstants.PROPERTY_TYPE_BOOLEAN,
      defaultValue = "True")
  @SimpleProperty(category = PropertyCategory.BEHAVIOR,
      description = "Keep the signed-in key in the app's private storage so "
      + "the user stays signed in across app restarts. The key is stored in the "
      + "app-private directory only; SignOut removes it.")
  public void RememberSignIn(boolean remember) {
    rememberSignIn = remember;
    if (!remember) {
      accessToken = null;
      tokenLoaded = true;
      deleteSavedToken();
    }
  }

  /**
   * Returns whether the signed-in key is persisted.
   *
   * @return true when the key is remembered across restarts
   */
  @SimpleProperty(category = PropertyCategory.BEHAVIOR)
  public boolean RememberSignIn() {
    return rememberSignIn;
  }

  /**
   * The default model used by Chat, ChatWithHistory and AskAboutImage when
   * the model parameter is empty. Any model name from
   * https://gen.pollinations.ai/text/models works.
   *
   * @param model a text model name
   */
  @DesignerProperty(editorType = PropertyTypeConstants.PROPERTY_TYPE_STRING,
      defaultValue = DEFAULT_TEXT_MODEL)
  @SimpleProperty(category = PropertyCategory.BEHAVIOR,
      description = "Default text model for Chat, ChatWithHistory and "
      + "AskAboutImage (any model from gen.pollinations.ai/text/models).")
  public void TextModel(String model) {
    textModel = trimToEmpty(model);
  }

  /**
   * Returns the default text model.
   *
   * @return the text model name
   */
  @SimpleProperty(category = PropertyCategory.BEHAVIOR)
  public String TextModel() {
    return textModel;
  }

  /**
   * The default model used by GenerateImage when the model parameter is
   * empty. Any model from https://gen.pollinations.ai/image/models works.
   *
   * @param model an image model name
   */
  @DesignerProperty(editorType = PropertyTypeConstants.PROPERTY_TYPE_STRING,
      defaultValue = DEFAULT_IMAGE_MODEL)
  @SimpleProperty(category = PropertyCategory.BEHAVIOR,
      description = "Default image model for GenerateImage "
      + "(any model from gen.pollinations.ai/image/models).")
  public void ImageModel(String model) {
    imageModel = trimToEmpty(model);
  }

  /**
   * Returns the default image model.
   *
   * @return the image model name
   */
  @SimpleProperty(category = PropertyCategory.BEHAVIOR)
  public String ImageModel() {
    return imageModel;
  }

  /**
   * The default model used by Speak and SpeakAndPlay. Any model from
   * https://gen.pollinations.ai/audio/models works.
   *
   * @param model a speech model name
   */
  @DesignerProperty(editorType = PropertyTypeConstants.PROPERTY_TYPE_STRING,
      defaultValue = DEFAULT_SPEECH_MODEL)
  @SimpleProperty(category = PropertyCategory.BEHAVIOR,
      description = "Default speech model for Speak and SpeakAndPlay "
      + "(any model from gen.pollinations.ai/audio/models).")
  public void SpeechModel(String model) {
    speechModel = trimToEmpty(model);
  }

  /**
   * Returns the default speech model.
   *
   * @return the speech model name
   */
  @SimpleProperty(category = PropertyCategory.BEHAVIOR)
  public String SpeechModel() {
    return speechModel;
  }

  /**
   * The voice used by Speak and SpeakAndPlay when the voice parameter is
   * empty, for example "alloy", "echo", "fable", "onyx", "nova" or "shimmer".
   *
   * @param voice a voice name
   */
  @DesignerProperty(editorType = PropertyTypeConstants.PROPERTY_TYPE_STRING,
      defaultValue = DEFAULT_VOICE)
  @SimpleProperty(category = PropertyCategory.BEHAVIOR,
      description = "Default voice for Speak and SpeakAndPlay "
      + "(for example alloy, echo, fable, onyx, nova or shimmer).")
  public void Voice(String voice) {
    this.voice = trimToEmpty(voice);
  }

  /**
   * Returns the default voice.
   *
   * @return the voice name
   */
  @SimpleProperty(category = PropertyCategory.BEHAVIOR)
  public String Voice() {
    return voice;
  }

  // ---------------------------------------------------------------------
  // Sign-in (Bring Your Own Pollen device flow) and key management

  /**
   * Starts the Pollinations sign-in flow (Bring Your Own Pollen device
   * flow).
   *
   * <p>The browser opens the verification page, the user signs in with their
   * own account and approves, and this extension polls until the key
   * arrives. Events:</p>
   *
   * <ul>
   *   <li>{@link #SignInStarted(String, String)} when the page opens (it
   *       also carries the URL and user code in case no browser is
   *       available)</li>
   *   <li>{@link #SignedIn()} when the key arrives</li>
   *   <li>{@link #SignInFailed(String)} when the user denies, the request
   *       expires, or the network fails</li>
   * </ul>
   *
   * <p>The received key pays for requests with the user's own Pollen. No
   * key ships inside the app. Call SignOut to forget the key.</p>
   */
  @SimpleFunction(description = "Sign in with the user's own Pollinations account "
      + "(Bring Your Own Pollen). The browser opens the approval page and SignedIn "
      + "fires once the user approves. Fails with SignInFailed when denied, expired "
      + "or offline.")
  public void SignIn() {
    final long generation = deviceFlowGeneration.incrementAndGet();
    deviceFlowExecutor.execute(new Runnable() {
      @Override
      public void run() {
        runDeviceFlow(generation);
      }
    });
  }

  /**
   * Forgets the signed-in key (and removes it from private storage when
   * RememberSignIn is true). Requests may still work anonymously until the
   * next SignIn.
   */
  @SimpleFunction(description = "Signs out: forgets the signed-in key and removes it "
      + "from the app's private storage. Call SignIn again to get a new one.")
  public void SignOut() {
    stopSignIn();
    accessToken = null;
    tokenLoaded = true;
    deleteSavedToken();
  }

  /**
   * Uses a Pollinations API key directly (sk_...) instead of the sign-in
   * flow. For development only: any key entered here ships inside your app.
   * Prefer SignIn so users pay with their own Pollen.
   *
   * @param apiKey a Pollinations API key (sk_...), or "" to clear it
   */
  @SimpleFunction(description = "Use a Pollinations API key (sk_...) directly instead "
      + "of the SignIn flow. NOTE: any key entered here ships inside your app; prefer "
      + "SignIn so users pay with their own Pollen. Pass an empty string to clear it.")
  public void SetApiKey(String apiKey) {
    accessToken = trimToEmpty(apiKey);
    tokenLoaded = true;
  }

  /**
   * Returns true when a key is available (from SignIn or SetApiKey).
   *
   * @return true when signed in
   */
  @SimpleFunction(description = "Returns true when a key is available (from SignIn "
      + "or SetApiKey). Speech and speech-to-text always need one.")
  public boolean IsSignedIn() {
    return currentToken() != null;
  }

  /** Event raised when the sign-in page has opened and polling started. */
  @SimpleEvent(description = "The sign-in page opened in the browser. VerificationUrl "
      + "and UserCode are also provided, for example to show them in a label when "
      + "no browser is available.")
  public void SignInStarted(String verificationUrl, String userCode) {
    EventDispatcher.dispatchEvent(this, "SignInStarted", verificationUrl, userCode);
  }

  /** Event raised when the user approved and the key is ready to use. */
  @SimpleEvent(description = "The user approved sign-in. Pollinations calls now use "
      + "their Pollen.")
  public void SignedIn() {
    EventDispatcher.dispatchEvent(this, "SignedIn");
  }

  /** Event raised when the sign-in flow failed (denied, expired or offline). */
  @SimpleEvent(description = "Sign-in failed. Reason explains what happened: the user "
      + "denied it, the request expired, or the network is down.")
  public void SignInFailed(String reason) {
    EventDispatcher.dispatchEvent(this, "SignInFailed", reason);
  }

  /**
   * Returns the key to use, loading the remembered one on first use. The
   * designer property RememberSignIn is applied before the first call, so
   * keys are only restored when the developer asked for it.
   */
  private String currentToken() {
    if (!tokenLoaded) {
      tokenLoaded = true;
      if (rememberSignIn) {
        accessToken = readSavedToken();
      }
    }
    return accessToken == null || accessToken.length() == 0 ? null : accessToken;
  }

  /**
   * Runs the device flow on the device-flow executor. Opens the verification
   * page in the browser, then polls the token endpoint every interval
   * seconds until the key arrives, the user denies, or the code expires.
   */
  private void runDeviceFlow(final long generation) {
    try {
      JSONObject request = new JSONObject();
      if (appKey.length() > 0) {
        request.put("client_id", appKey);
      }
      HttpResponse response = httpPostJson(
          ENTER_BASE + "/api/device/code", request.toString(), null);
      if (response.code != 200) {
        fireSignInFailed(friendlyHttpError(response,
            "Could not start the sign-in flow. Check your network and, if you set an "
                + "App Key, that it is a valid publishable key (pk_...)."));
        return;
      }
      JSONObject body = new JSONObject(new String(response.body, "UTF-8"));
      final String deviceCode = body.getString("device_code");
      final String userCode = body.optString("user_code", "");
      String verificationUriComplete = body.optString("verification_uri_complete", "");
      final String verificationUri = verificationUriComplete.length() > 0
          ? verificationUriComplete
          : body.optString("verification_uri", ENTER_BASE + "/device");
      long expiresInMillis = body.optLong("expires_in", 1800) * 1000L;
      long intervalMillis = body.optLong("interval", 5) * 1000L;
      if (intervalMillis <= 0) {
        intervalMillis = 5000;
      }

      // Tell the app the flow started, then open the page in the browser.
      postEvent(new Runnable() {
        @Override
        public void run() {
          SignInStarted(verificationUri, userCode);
        }
      });
      openInBrowser(verificationUri);

      long deadline = System.currentTimeMillis() + expiresInMillis;
      while (System.currentTimeMillis() < deadline) {
        sleepQuietly(intervalMillis);
        if (generation != deviceFlowGeneration.get()) {
          return; // A newer flow or SignOut replaced this one.
        }
        JSONObject pollRequest = new JSONObject();
        pollRequest.put("device_code", deviceCode);
        HttpResponse poll = httpPostJson(
            ENTER_BASE + "/api/device/token", pollRequest.toString(), null);
        String pollBody = poll.body == null ? "" : new String(poll.body, "UTF-8");
        JSONObject pollJson;
        try {
          pollJson = new JSONObject(pollBody);
        } catch (JSONException e) {
          pollJson = new JSONObject();
        }
        if (pollJson.has("access_token")) {
          final String token = pollJson.getString("access_token");
          accessToken = token;
          tokenLoaded = true;
          if (rememberSignIn) {
            saveToken(token);
          }
          postEvent(new Runnable() {
            @Override
            public void run() {
              SignedIn();
            }
          });
          return;
        }
        String error = pollJson.optString("error", "");
        if ("authorization_pending".equals(error)) {
          continue; // Keep waiting for the user.
        } else if ("slow_down".equals(error)) {
          intervalMillis += 5000; // RFC 8628: back off.
          continue;
        } else if ("expired_token".equals(error)) {
          fireSignInFailed("The sign-in request expired. Please call SignIn again.");
          return;
        } else if ("access_denied".equals(error)) {
          fireSignInFailed("Sign-in was denied.");
          return;
        } else if ("invalid_grant".equals(error) || poll.code >= 400) {
          fireSignInFailed(friendlyHttpError(poll, "Sign-in could not be completed."));
          return;
        }
      }
      fireSignInFailed("The sign-in request expired. Please call SignIn again.");
    } catch (Exception e) {
      fireSignInFailed("Sign-in failed: " + exceptionMessage(e));
    }
  }

  /** Stops any in-flight device flow without touching a stored key. */
  private void stopSignIn() {
    deviceFlowGeneration.incrementAndGet();
  }

  /** Opens a URL in the browser, ignoring the absence of one. */
  private void openInBrowser(final String url) {
    postEvent(new Runnable() {
      @Override
      public void run() {
        try {
          Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
          context.startActivity(intent);
        } catch (Exception e) {
          // No browser; SignInStarted already carried the URL and user code.
          android.util.Log.w(LOG_TAG, "Could not open browser: " + e.getMessage());
        }
      }
    });
  }

  private void fireSignInFailed(final String reason) {
    postEvent(new Runnable() {
      @Override
      public void run() {
        SignInFailed(reason);
      }
    });
  }

  // ---------------------------------------------------------------------
  // Chat (text)

  /**
   * Sends a prompt to a Pollinations text model and raises GotChat with the
   * reply, or GotError when something goes wrong. Uses the TextModel
   * property when the model parameter is empty.
   *
   * @param prompt the user's message
   * @param model a model from gen.pollinations.ai/text/models, or "" for TextModel
   */
  @SimpleFunction(description = "Asks a Pollinations text model. GotChat fires with "
      + "the reply, or GotError when the request fails. Model can be empty to use the "
      + "TextModel property; any model from gen.pollinations.ai/text/models works.")
  public void Chat(String prompt, String model) {
    final String promptArg = safeString(prompt);
    final String modelArg = modelOrDefault(model, textModel);
    submit("Chat", new Job() {
      @Override
      public void run() throws Exception {
        JSONArray messages = new JSONArray();
        messages.put(userMessage(promptArg));
        postChatResult(modelArg, messages);
      }
    });
  }

  /**
   * Sends a prompt together with the conversation history to a Pollinations
   * text model, and raises GotChat with the reply or GotError. HistoryJson
   * is a JSON list of objects like {"role":"user","content":"..."} and
   * {"role":"assistant","content":"..."}; drop older turns when it grows,
   * keeping only what you want the model to remember.
   *
   * @param prompt the new user's message
   * @param historyJson a JSON list of earlier turns, or "" for none
   * @param model a model from gen.pollinations.ai/text/models, or "" for TextModel
   */
  @SimpleFunction(description = "Asks a Pollinations text model with conversation "
      + "history. HistoryJson is a JSON list like "
      + "[{\"role\":\"user\",\"content\":\"hi\"},"
      + "{\"role\":\"assistant\",\"content\":\"hello\"}]. GotChat fires with the "
      + "reply, or GotError when the request fails.")
  public void ChatWithHistory(String prompt, String historyJson, String model) {
    final String promptArg = safeString(prompt);
    final String modelArg = modelOrDefault(model, textModel);
    final String historyArg = safeString(historyJson);
    submit("ChatWithHistory", new Job() {
      @Override
      public void run() throws Exception {
        JSONArray messages = parseHistory(historyArg);
        messages.put(userMessage(promptArg));
        postChatResult(modelArg, messages);
      }
    });
  }

  /** Runs a chat completion and raises GotChat with the reply. */
  private void postChatResult(String model, JSONArray messages) throws Exception {
    final String answer = chatCompletion(model, messages);
    postEvent(new Runnable() {
      @Override
      public void run() {
        GotChat(answer);
      }
    });
  }

  /** Event raised with a reply from Chat or ChatWithHistory. */
  @SimpleEvent(description = "A reply from Chat or ChatWithHistory arrived.")
  public void GotChat(String response) {
    EventDispatcher.dispatchEvent(this, "GotChat", response);
  }

  /** Event raised when any Pollinations request fails. */
  @SimpleEvent(description = "A Pollinations request failed. Function names the call "
      + "(Chat, ChatWithHistory, GenerateImage, Speak, Transcribe, AskAboutImage, "
      + "ListModels) and Message explains the problem, including what to do for "
      + "sign-in, balance and rate-limit errors.")
  public void GotError(String function, String message) {
    EventDispatcher.dispatchEvent(this, "GotError", function, message);
  }

  // ---------------------------------------------------------------------
  // Images

  /**
   * Generates an image from a prompt and raises GotImage with the absolute
   * path of the saved file, ready to show: set Image1.Picture to that path.
   * Or GotError when the request fails. Uses the ImageModel property when
   * the model parameter is empty.
   *
   * @param prompt what to draw
   * @param model a model from gen.pollinations.ai/image/models, or "" for ImageModel
   * @param width image width in pixels (1024 when 0 or negative)
   * @param height image height in pixels (1024 when 0 or negative)
   */
  @SimpleFunction(description = "Generates an image from a prompt. GotImage fires with "
      + "the absolute path of the saved file - set Image1.Picture to it to show it. "
      + "Model can be empty to use the ImageModel property; any model from "
      + "gen.pollinations.ai/image/models works.")
  public void GenerateImage(String prompt, String model, int width, int height) {
    final String promptArg = safeString(prompt);
    final String modelArg = modelOrDefault(model, imageModel);
    final int widthArg = width > 0 ? width : 1024;
    final int heightArg = height > 0 ? height : 1024;
    submit("GenerateImage", new Job() {
      @Override
      public void run() throws Exception {
        StringBuilder url = new StringBuilder(GEN_BASE)
            .append("/image/")
            .append(urlEncode(promptArg))
            .append("?model=").append(urlEncode(modelArg))
            .append("&width=").append(widthArg)
            .append("&height=").append(heightArg);
        HttpResponse response = httpGet(url.toString());
        if (response.code != 200) {
          throw new PollinationsException(friendlyHttpError(response,
              "The image service returned an error."));
        }
        String extension = extensionFromContentType(response.contentType, ".jpg");
        File file = writeOutputFile("pollinations_image_", extension, response.body);
        final String path = file.getAbsolutePath();
        postEvent(new Runnable() {
          @Override
          public void run() {
            GotImage(path);
          }
        });
      }
    });
  }

  /** Event raised with the saved image's absolute path. */
  @SimpleEvent(description = "A generated image was saved. FileName is its absolute "
      + "path; set an Image component's Picture to it to display it.")
  public void GotImage(String fileName) {
    EventDispatcher.dispatchEvent(this, "GotImage", fileName);
  }

  // ---------------------------------------------------------------------
  // Speech (text-to-speech)

  /**
   * Turns text into an audio file and raises GotSpeech with its absolute
   * path (an .mp3 file you can play with the Player or Sound component).
   * Or GotError when the request fails. Uses the SpeechModel and Voice
   * properties when the parameters are empty. Requires a signed-in user;
   * speech has no anonymous tier.
   *
   * @param text the text to speak
   * @param voice a voice name, or "" for the Voice property
   */
  @SimpleFunction(description = "Turns text into a speech audio file. GotSpeech fires "
      + "with the absolute path of the saved .mp3 - play it with the Player or Sound "
      + "component. Voice can be empty to use the Voice property. Requires sign-in "
      + "(speech has no anonymous tier).")
  public void Speak(String text, String voice) {
    submit("Speak", speakJob(text, voice, false));
  }

  /**
   * Convenience combination: turns text into speech and plays it right away
   * through this extension. GotSpeech fires with the saved file's path,
   * AfterSpeaking fires when playback finishes, and GotError when the
   * request fails. Uses the SpeechModel and Voice properties when the
   * parameters are empty.
   *
   * @param text the text to speak
   * @param voice a voice name, or "" for the Voice property
   */
  @SimpleFunction(description = "Turns text into speech and plays it. GotSpeech fires "
      + "with the saved file, AfterSpeaking fires when playback completes, and "
      + "StopSpeaking stops early. Voice can be empty to use the Voice property.")
  public void SpeakAndPlay(String text, String voice) {
    submit("Speak", speakJob(text, voice, true));
  }

  /**
   * Stops playback started by SpeakAndPlay. AfterSpeaking will not fire.
   */
  @SimpleFunction(description = "Stops the playback started by SpeakAndPlay.")
  public void StopSpeaking() {
    postEvent(new Runnable() {
      @Override
      public void run() {
        stopMediaPlayer();
      }
    });
  }

  /** Event raised with the saved speech audio's absolute path. */
  @SimpleEvent(description = "A speech audio file was saved. FileName is its absolute "
      + "path; play it with the Player or Sound component.")
  public void GotSpeech(String fileName) {
    EventDispatcher.dispatchEvent(this, "GotSpeech", fileName);
  }

  /** Event raised when playback started by SpeakAndPlay finished. */
  @SimpleEvent(description = "Playback started by SpeakAndPlay finished (or was "
      + "stopped with StopSpeaking).")
  public void AfterSpeaking() {
    EventDispatcher.dispatchEvent(this, "AfterSpeaking");
  }

  private Job speakJob(String text, String voiceParam, final boolean play) {
    final String textArg = safeString(text);
    final String voiceArg = modelOrDefault(voiceParam, this.voice);
    return new Job() {
      @Override
      public void run() throws Exception {
        StringBuilder url = new StringBuilder(GEN_BASE)
            .append("/audio/")
            .append(urlEncode(textArg))
            .append("?model=").append(urlEncode(speechModel))
            .append("&voice=").append(urlEncode(voiceArg));
        HttpResponse response = httpGet(url.toString());
        if (response.code != 200) {
          throw new PollinationsException(friendlyHttpError(response,
              "The speech service returned an error."));
        }
        String extension = extensionFromContentType(response.contentType, ".mp3");
        File file = writeOutputFile("pollinations_speech_", extension, response.body);
        final String path = file.getAbsolutePath();
        postEvent(new Runnable() {
          @Override
          public void run() {
            GotSpeech(path);
            if (play) {
              playAudioFile(path);
            }
          }
        });
      }
    };
  }

  /** Plays a finished speech file on the UI thread and notifies when done. */
  private void playAudioFile(String path) {
    stopMediaPlayer();
    try {
      mediaPlayer = new MediaPlayer();
      mediaPlayer.setDataSource(path);
      mediaPlayer.setAudioStreamType(android.media.AudioManager.STREAM_MUSIC);
      mediaPlayer.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
        @Override
        public void onPrepared(MediaPlayer player) {
          player.start();
        }
      });
      mediaPlayer.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
        @Override
        public void onCompletion(MediaPlayer player) {
          releaseMediaPlayer();
          AfterSpeaking();
        }
      });
      mediaPlayer.prepareAsync();
    } catch (Exception e) {
      releaseMediaPlayer();
      GotError("Speak", "Could not play the speech audio: " + exceptionMessage(e));
    }
  }

  private void stopMediaPlayer() {
    if (mediaPlayer != null) {
      try {
        mediaPlayer.stop();
      } catch (Exception e) {
        // Not started yet; ignore.
      }
      releaseMediaPlayer();
    }
  }

  private void releaseMediaPlayer() {
    if (mediaPlayer != null) {
      try {
        mediaPlayer.release();
      } catch (Exception e) {
        // Ignore; already released.
      }
      mediaPlayer = null;
    }
  }

  // ---------------------------------------------------------------------
  // Speech-to-text

  /**
   * Transcribes a recording to text and raises GotTranscription with the
   * text, or GotError when the request fails. RecordingPath accepts the
   * value of SoundRecorder's AfterSoundRecorded event, an absolute path such
   * as "/storage/emulated/0/...", a "file:///..." URI, a "content://..." URI
   * (as returned by pickers on newer Androids), or a file in the app's
   * default directory. Recordings in formats the transcription service does
   * not accept (for example SoundRecorder's .3gp) are converted on the
   * device to .wav first. Requires a signed-in user.
   *
   * @param recordingPath the audio file to transcribe
   */
  @SimpleFunction(description = "Transcribes a recording to text - the thing the Web "
      + "component cannot do, because the transcription API needs a multipart upload. "
      + "RecordingPath accepts SoundRecorder's AfterSoundRecorded value, an absolute "
      + "path, a file:/// or content:// URI, or a file in the app's default directory. "
      + "Formats like .3gp are converted to .wav on the device first. "
      + "GotTranscription fires with the text. Requires sign-in.")
  public void Transcribe(final String recordingPath) {
    final String pathArg = safeString(recordingPath);
    submit("Transcribe", new Job() {
      @Override
      public void run() throws Exception {
        byte[] audio;
        String uploadName = guessFileName(pathArg);
        if (needsTranscode(pathArg)) {
          try {
            audio = transcodeToWav(pathArg);
            uploadName = "recording.wav";
          } catch (Exception e) {
            // Fall back to the original bytes; the server decides.
            android.util.Log.w(LOG_TAG,
                "Could not convert the recording to wav: " + e.getMessage());
            audio = readFileBytes(pathArg);
          }
        } else {
          audio = readFileBytes(pathArg);
        }
        String boundary = "pollinations" + System.currentTimeMillis();
        byte[] body = buildMultipartBody(boundary, "file", uploadName, audio);
        HttpResponse response = httpPostRaw(
            GEN_BASE + "/v1/audio/transcriptions", body,
            "multipart/form-data; boundary=" + boundary);
        if (response.code != 200) {
          throw new PollinationsException(friendlyHttpError(response,
              "The transcription service returned an error."));
        }
        JSONObject bodyJson = new JSONObject(new String(response.body, "UTF-8"));
        final String text = bodyJson.optString("text", "");
        postEvent(new Runnable() {
          @Override
          public void run() {
            GotTranscription(text);
          }
        });
      }
    });
  }

  /** Event raised with the transcription of a recording. */
  @SimpleEvent(description = "A recording was transcribed. Response contains the "
      + "recognized text.")
  public void GotTranscription(String response) {
    EventDispatcher.dispatchEvent(this, "GotTranscription", response);
  }

  // ---------------------------------------------------------------------
  // Vision

  /**
   * Asks a text model about an image and raises GotImageAnswer with the
   * answer, or GotError when the request fails - the other thing the Web
   * component cannot do well, because it needs a multimodal request.
   * ImagePath accepts an absolute path, a "file:///..." URI, a
   * "content://..." URI (as returned by pickers on newer Androids), or a
   * file in the app's default directory. Uses the TextModel property when
   * the model parameter is empty; pick a model that accepts image input
   * (ListModels shows them).
   *
   * @param prompt the question about the image
   * @param imagePath where the image is
   * @param model a vision-capable text model, or "" for TextModel
   */
  @SimpleFunction(description = "Asks a text model about an image - the other thing the "
      + "Web component cannot do well, because it needs a multimodal request with the "
      + "image attached. ImagePath accepts an absolute path, a file:/// or content:// "
      + "URI (as returned by pickers), or a file in the app's default directory. "
      + "GotImageAnswer fires with the answer.")
  public void AskAboutImage(String prompt, String imagePath, String model) {
    final String promptArg = safeString(prompt);
    final String modelArg = modelOrDefault(model, textModel);
    final String pathArg = safeString(imagePath);
    submit("AskAboutImage", new Job() {
      @Override
      public void run() throws Exception {
        byte[] image = readFileBytes(pathArg);
        String dataUri = "data:" + guessImageMime(pathArg) + ";base64,"
            + Base64.encodeToString(image, Base64.NO_WRAP);
        JSONArray content = new JSONArray();
        content.put(new JSONObject().put("type", "text").put("text", promptArg));
        content.put(new JSONObject().put("type", "image_url")
            .put("image_url", new JSONObject().put("url", dataUri)));
        JSONArray messages = new JSONArray();
        messages.put(new JSONObject().put("role", "user").put("content", content));
        final String answer = chatCompletion(modelArg, messages);
        postEvent(new Runnable() {
          @Override
          public void run() {
            GotImageAnswer(answer);
          }
        });
      }
    });
  }

  /** Event raised with the answer to AskAboutImage. */
  @SimpleEvent(description = "The answer to AskAboutImage arrived.")
  public void GotImageAnswer(String answer) {
    EventDispatcher.dispatchEvent(this, "GotImageAnswer", answer);
  }

  // ---------------------------------------------------------------------
  // Models

  /**
   * Fetches the live model list and raises GotModels with the raw JSON list
   * such as [{"name":"openai/gpt-5.4-nano", ...}] (use JsonTextDecode to work
   * with it). Category is "text", "image" or "audio". Or GotError when the
   * request fails.
   *
   * @param category "text", "image" or "audio"
   */
  @SimpleFunction(description = "Lists the live Pollinations models. Category is "
      + "\"text\", \"image\" or \"audio\". GotModels fires with the raw JSON list "
      + "(use the JsonTextDecode block to work with it).")
  public void ListModels(String category) {
    final String categoryArg;
    String cleaned = trimToEmpty(category).toLowerCase(Locale.US);
    if ("image".equals(cleaned) || "audio".equals(cleaned)) {
      categoryArg = cleaned;
    } else {
      categoryArg = "text"; // Default; also covers "" and unknown values.
    }
    submit("ListModels", new Job() {
      @Override
      public void run() throws Exception {
        HttpResponse response = httpGet(GEN_BASE + "/" + categoryArg + "/models");
        if (response.code != 200) {
          throw new PollinationsException(friendlyHttpError(response,
              "Could not load the model list."));
        }
        final String models = new String(response.body, "UTF-8");
        new JSONArray(models); // Validate before raising the event.
        postEvent(new Runnable() {
          @Override
          public void run() {
            GotModels(models);
          }
        });
      }
    });
  }

  /** Event raised with the live model list as a JSON list. */
  @SimpleEvent(description = "The model list arrived as a JSON list of model objects.")
  public void GotModels(String modelsJson) {
    EventDispatcher.dispatchEvent(this, "GotModels", modelsJson);
  }

  // ---------------------------------------------------------------------
  // Networking core

  /** A unit of background work that may fail with an exception. */
  private interface Job {
    void run() throws Exception;
  }

  /** Runs a job on the background worker; failures become GotError. */
  private void submit(final String function, final Job job) {
    apiExecutor.execute(new Runnable() {
      @Override
      public void run() {
        try {
          job.run();
        } catch (Exception e) {
          final String message = exceptionMessage(e);
          postEvent(new Runnable() {
            @Override
            public void run() {
              GotError(function, message);
            }
          });
        }
      }
    });
  }

  /** Posts a runnable to the App Inventor (main) thread. */
  private void postEvent(Runnable runnable) {
    uiHandler.post(runnable);
  }

  /** Result of an HTTP request. */
  private static class HttpResponse {
    final int code;
    final String contentType;
    final byte[] body;

    HttpResponse(int code, String contentType, byte[] body) {
      this.code = code;
      this.contentType = contentType;
      this.body = body;
    }
  }

  /**
   * Exception carrying a message ready to show in GotError. Extends
   * IOException so file reading helpers can raise it alongside I/O errors.
   */
  private static class PollinationsException extends IOException {
    PollinationsException(String message) {
      super(message);
    }
  }

  /** The Authorization header when a key is available, else null. */
  private String authHeaderOrNull() {
    String token = currentToken();
    return token == null ? null : "Bearer " + token;
  }

  /** Performs a GET request, attaching the auth header when signed in. */
  private HttpResponse httpGet(String url) throws IOException {
    return httpExchange("GET", url, null, null, authHeaderOrNull());
  }

  /** Performs a POST with a JSON body and an explicit (or no) auth header. */
  private HttpResponse httpPostJson(String url, String json, String auth)
      throws IOException {
    return httpExchange("POST", url, "application/json; charset=utf-8",
        json.getBytes("UTF-8"), auth);
  }

  /** Performs a POST with a raw body, attaching the auth header when signed in. */
  private HttpResponse httpPostRaw(String url, byte[] body, String contentType)
      throws IOException {
    return httpExchange("POST", url, contentType, body, authHeaderOrNull());
  }

  private HttpResponse httpExchange(String method, String url, String contentType,
      byte[] body, String auth) throws IOException {
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) new URL(url).openConnection();
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(READ_TIMEOUT_MS);
      connection.setRequestMethod(method);
      if (auth != null) {
        connection.setRequestProperty("Authorization", auth);
      }
      if (contentType != null) {
        connection.setRequestProperty("Content-Type", contentType);
      }
      connection.setRequestProperty("Accept", "*/*");
      if (body != null) {
        connection.setDoOutput(true);
        connection.setFixedLengthStreamingMode(body.length);
        OutputStream out = connection.getOutputStream();
        try {
          out.write(body);
          out.flush();
        } finally {
          closeQuietly(out);
        }
      }
      int code = connection.getResponseCode();
      String type = connection.getContentType();
      InputStream stream = code >= 400
          ? connection.getErrorStream()
          : connection.getInputStream();
      byte[] bytes = stream == null ? new byte[0] : readAll(stream);
      return new HttpResponse(code, type == null ? "" : type, bytes);
    } finally {
      if (connection != null) {
        connection.disconnect();
      }
    }
  }

  /**
   * Calls POST /v1/chat/completions and returns the reply text. Message
   * content can be a plain string or a multimodal content array (as built
   * by AskAboutImage).
   */
  private String chatCompletion(String model, JSONArray messages) throws Exception {
    JSONObject request = new JSONObject();
    request.put("model", model);
    request.put("messages", messages);
    HttpResponse response = httpPostJson(
        GEN_BASE + "/v1/chat/completions", request.toString(), authHeaderOrNull());
    if (response.code != 200) {
      throw new PollinationsException(friendlyHttpError(response,
          "The text service returned an error."));
    }
    JSONObject body = new JSONObject(new String(response.body, "UTF-8"));
    JSONArray choices = body.optJSONArray("choices");
    if (choices == null || choices.length() == 0) {
      throw new PollinationsException(
          "The model returned no answer. It may not support this request "
              + "(for example, not accept images).");
    }
    Object content = choices.getJSONObject(0).getJSONObject("message").get("content");
    return content instanceof String ? (String) content : content.toString();
  }

  // ---------------------------------------------------------------------
  // JSON helpers

  /** Builds a {"role":"user","content":"..."} message. */
  private static JSONObject userMessage(String prompt) throws JSONException {
    return new JSONObject().put("role", "user").put("content", prompt);
  }

  /**
   * Parses a HistoryJson list into a messages array. Objects need a "role"
   * and a "content"; other fields are ignored. Unknown or missing roles
   * become "user".
   */
  private static JSONArray parseHistory(String historyJson) throws JSONException {
    JSONArray messages = new JSONArray();
    if (historyJson.length() > 0) {
      JSONArray history = new JSONArray(historyJson);
      for (int i = 0; i < history.length(); i++) {
        JSONObject turn = history.optJSONObject(i);
        if (turn == null) {
          continue;
        }
        String role = turn.optString("role", "user");
        if (!"user".equals(role) && !"assistant".equals(role)
            && !"system".equals(role) && !"developer".equals(role)) {
          role = "user";
        }
        messages.put(new JSONObject()
            .put("role", role)
            .put("content", turn.opt("content")));
      }
    }
    return messages;
  }

  // ---------------------------------------------------------------------
  // File helpers

  /**
   * Reads a file or URI. Accepts absolute paths ("/storage/..."),
   * "file:///..." URIs, "content://..." URIs (pickers), and App Inventor
   * file semantics: names relative to the app's default directory, "//name"
   * for bundled assets (rejected with a helpful message), and "/" for the
   * external storage root.
   */
  private byte[] readFileBytes(String path) throws IOException {
    if (path.length() == 0) {
      throw new PollinationsException(
          "The file name is empty. Pass the value from SoundRecorder's "
              + "AfterSoundRecorded event or a picker's result.");
    }
    if (path.startsWith("content://")) {
      InputStream stream = context.getContentResolver()
          .openInputStream(Uri.parse(path));
      if (stream == null) {
        throw new PollinationsException(
            "Could not open the content URI: " + path);
      }
      return readAll(stream);
    }
    String cleaned = path;
    if (cleaned.startsWith("file://")) {
      cleaned = cleaned.substring("file://".length());
    }
    if (cleaned.startsWith("//")) { // Asset in the app's package
      throw new PollinationsException(
          "Bundled assets cannot be read here. Copy the file into the app's "
              + "default directory, or pick it with a picker component.");
    }
    File file = resolveExistingFile(cleaned);
    if (file == null || !file.exists() || !file.isFile()) {
      throw new PollinationsException(
          "File not found: " + path + ". Pass an absolute path, the value from "
              + "SoundRecorder's AfterSoundRecorded event, or a picker's result.");
    }
    return readAll(new FileInputStream(file));
  }

  /**
   * Resolves an App Inventor path to an existing file, or null. Relative
   * names are tried in the app's default directory, then the legacy shared
   * AppInventor/data directory, then the app's private directory.
   */
  private File resolveExistingFile(String path) {
    if (path.startsWith("/")) {
      return new File(path); // Absolute.
    }
    File asd = new File(context.getExternalFilesDir(null), path);
    if (asd.exists()) {
      return asd;
    }
    File legacy = new File(android.os.Environment
        .getExternalStorageDirectory(), "AppInventor/data/" + path);
    if (legacy.exists()) {
      return legacy;
    }
    File priv = new File(context.getFilesDir(), path);
    if (priv.exists()) {
      return priv;
    }
    return asd; // Best guess; the caller reports a clear error if missing.
  }

  /** Writes generated media into the app's own storage and returns it. */
  private File writeOutputFile(String prefix, String extension, byte[] bytes)
      throws IOException {
    File base = context.getExternalFilesDir(null);
    if (base == null) {
      base = context.getFilesDir(); // No external storage; use internal.
    }
    File directory = new File(base, OUTPUT_DIR);
    if (!directory.exists() && !directory.mkdirs()) {
      directory = base;
    }
    String stamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)
        .format(new Date());
    File file = new File(directory, prefix + stamp + extension);
    FileOutputStream out = new FileOutputStream(file);
    try {
      out.write(bytes);
      out.flush();
    } finally {
      closeQuietly(out);
    }
    return file;
  }

  /** Builds a multipart/form-data body with a single file field. */
  private static byte[] buildMultipartBody(String boundary, String fieldName,
      String fileName, byte[] fileBytes) throws IOException {
    String pre = "--" + boundary + "\r\n"
        + "Content-Disposition: form-data; name=\"" + fieldName
        + "\"; filename=\"" + fileName + "\"\r\n"
        + "Content-Type: application/octet-stream\r\n"
        + "\r\n";
    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    buffer.write(pre.getBytes("UTF-8"));
    buffer.write(fileBytes);
    buffer.write(("\r\n--" + boundary + "--\r\n").getBytes("UTF-8"));
    return buffer.toByteArray();
  }

  /** Picks a plausible file name for the multipart upload field. */
  private static String guessFileName(String path) {
    if (path.startsWith("content://")) {
      return "recording.mp3"; // Content URIs often have no usable name.
    }
    String cleaned = path.replace('\\', '/');
    int slash = cleaned.lastIndexOf('/');
    String name = slash >= 0 ? cleaned.substring(slash + 1) : cleaned;
    return name.length() > 0 ? name : "recording.mp3";
  }

  /**
   * True when the transcription service is expected to accept the file as
   * is. Formats it does not list (3gp, amr, aac, ...) are converted to wav on
   * the device first; see {@link #transcodeToWav(String)}.
   */
  private boolean needsTranscode(String path) {
    String mime = null;
    if (path.startsWith("content://")) {
      try {
        mime = context.getContentResolver().getType(Uri.parse(path));
      } catch (Exception e) {
        mime = null; // Fall through to the name check.
      }
    }
    if (mime != null) {
      String lower = mime.toLowerCase(Locale.US);
      return !lower.startsWith("audio/mpeg") && !lower.startsWith("audio/mp4")
          && !lower.startsWith("audio/ogg") && !lower.startsWith("audio/wav")
          && !lower.startsWith("audio/x-wav") && !lower.startsWith("audio/flac")
          && !lower.startsWith("audio/webm");
    }
    String lower = guessFileName(path).toLowerCase(Locale.US);
    return !(lower.endsWith(".mp3") || lower.endsWith(".m4a")
        || lower.endsWith(".mp4") || lower.endsWith(".mpeg")
        || lower.endsWith(".mpga") || lower.endsWith(".wav")
        || lower.endsWith(".webm") || lower.endsWith(".ogg")
        || lower.endsWith(".oga") || lower.endsWith(".flac"));
  }

  /**
   * Decodes any device-playable audio (3gp, amr, aac, ...) to a 16-bit PCM
   * wav file in one byte array, using the platform decoders. This makes
   * SoundRecorder recordings transcribable even though the service does not
   * accept their .3gp format.
   */
  @SuppressLint("WrongConstant") // Encoder-specific constants below.
  private byte[] transcodeToWav(String path) throws Exception {
    // Content URIs need a real file for MediaExtractor's simplest API.
    File source = null;
    if (path.startsWith("content://")) {
      byte[] bytes = readFileBytes(path);
      source = new File(context.getCacheDir(), "pollinations_stt_input");
      FileOutputStream out = new FileOutputStream(source);
      try {
        out.write(bytes);
      } finally {
        closeQuietly(out);
      }
    }
    MediaExtractor extractor = new MediaExtractor();
    MediaCodec codec = null;
    try {
      if (source != null) {
        extractor.setDataSource(source.getAbsolutePath());
      } else {
        extractor.setDataSource(path);
      }
      MediaFormat inputFormat = null;
      String mime = null;
      for (int i = 0; i < extractor.getTrackCount(); i++) {
        MediaFormat format = extractor.getTrackFormat(i);
        String trackMime = format.getString(MediaFormat.KEY_MIME);
        if (trackMime != null && trackMime.startsWith("audio/")) {
          extractor.selectTrack(i);
          inputFormat = format;
          mime = trackMime;
          break;
        }
      }
      if (mime == null) {
        throw new IOException("No audio track found in the recording.");
      }
      codec = MediaCodec.createDecoderByType(mime);
      codec.configure(inputFormat, null, null, 0);
      codec.start();

      int sampleRate = inputFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE)
          ? inputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE) : 16000;
      int channels = inputFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)
          ? inputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT) : 1;

      MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
      ByteArrayOutputStream pcm = new ByteArrayOutputStream();
      boolean sawInputEnd = false;
      boolean sawOutputEnd = false;
      while (!sawOutputEnd) {
        if (!sawInputEnd) {
          int inIndex = codec.dequeueInputBuffer(10000);
          if (inIndex >= 0) {
            ByteBuffer in = codec.getInputBuffer(inIndex);
            int size = extractor.readSampleData(in, 0);
            if (size < 0) {
              codec.queueInputBuffer(inIndex, 0, 0, 0,
                  MediaCodec.BUFFER_FLAG_END_OF_STREAM);
              sawInputEnd = true;
            } else {
              codec.queueInputBuffer(inIndex, 0, size, extractor.getSampleTime(), 0);
              extractor.advance();
            }
          }
        }
        int outIndex = codec.dequeueOutputBuffer(info, 10000);
        if (outIndex >= 0) {
          ByteBuffer out = codec.getOutputBuffer(outIndex);
          if (out != null && info.size > 0) {
            byte[] chunk = new byte[info.size];
            out.get(chunk);
            pcm.write(chunk);
          }
          codec.releaseOutputBuffer(outIndex, false);
          if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
            sawOutputEnd = true;
          }
        } else if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          MediaFormat outputFormat = codec.getOutputFormat();
          sampleRate = outputFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE)
              ? outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE) : sampleRate;
          channels = outputFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)
              ? outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT) : channels;
        }
      }
      return wavFromPcm(pcm.toByteArray(), sampleRate, channels);
    } finally {
      try {
        if (codec != null) {
          codec.stop();
          codec.release();
        }
      } catch (Exception e) {
        // Ignore; already stopped.
      }
      extractor.release();
      if (source != null) {
        source.delete();
      }
    }
  }

  /** Wraps 16-bit little-endian PCM in a wav header. */
  private static byte[] wavFromPcm(byte[] pcm, int sampleRate, int channels) {
    int blockAlign = channels * 2;
    ByteArrayOutputStream out = new ByteArrayOutputStream(44 + pcm.length);
    try {
      out.write("RIFF".getBytes("US-ASCII"));
      writeInt(out, 36 + pcm.length);
      out.write("WAVE".getBytes("US-ASCII"));
      out.write("fmt ".getBytes("US-ASCII"));
      writeInt(out, 16);              // Chunk size.
      writeShort(out, (short) 1);     // PCM.
      writeShort(out, (short) channels);
      writeInt(out, sampleRate);
      writeInt(out, sampleRate * blockAlign);
      writeShort(out, (short) blockAlign);
      writeShort(out, (short) 16);    // Bits per sample.
      out.write("data".getBytes("US-ASCII"));
      writeInt(out, pcm.length);
      out.write(pcm);
    } catch (IOException e) {
      throw new IllegalStateException("Could not build wav", e);
    }
    return out.toByteArray();
  }

  private static void writeInt(OutputStream out, int value) throws IOException {
    out.write(value & 0xFF);
    out.write((value >> 8) & 0xFF);
    out.write((value >> 16) & 0xFF);
    out.write((value >> 24) & 0xFF);
  }

  private static void writeShort(OutputStream out, short value) throws IOException {
    out.write(value & 0xFF);
    out.write((value >> 8) & 0xFF);
  }

  /** Guesses the image MIME type from the file extension. */
  private static String guessImageMime(String path) {
    String lower = path.toLowerCase(Locale.US);
    if (lower.endsWith(".png")) {
      return "image/png";
    } else if (lower.endsWith(".webp")) {
      return "image/webp";
    } else if (lower.endsWith(".gif")) {
      return "image/gif";
    } else if (lower.endsWith(".bmp")) {
      return "image/bmp";
    }
    return "image/jpeg";
  }

  /** Maps a Content-Type to a file extension for saving. */
  private static String extensionFromContentType(String contentType, String fallback) {
    String type = contentType == null ? "" : contentType.toLowerCase(Locale.US);
    if (type.contains("png")) {
      return ".png";
    } else if (type.contains("webp")) {
      return ".webp";
    } else if (type.contains("wav")) {
      return ".wav";
    } else if (type.contains("ogg")) {
      return ".ogg";
    } else if (type.contains("mpeg") || type.contains("mp3")) {
      return ".mp3";
    } else if (type.contains("jpg") || type.contains("jpeg")) {
      return ".jpg";
    }
    return fallback;
  }

  // ---------------------------------------------------------------------
  // Token persistence (app-private storage)

  private File tokenFile() {
    return new File(context.getFilesDir(), TOKEN_FILE);
  }

  private String readSavedToken() {
    try {
      File file = tokenFile();
      if (!file.isFile()) {
        return null;
      }
      return new String(readAll(new FileInputStream(file)), "UTF-8").trim();
    } catch (Exception e) {
      return null;
    }
  }

  private void saveToken(String token) {
    try {
      FileOutputStream out = new FileOutputStream(tokenFile());
      try {
        out.write(token.getBytes("UTF-8"));
      } finally {
        closeQuietly(out);
      }
    } catch (Exception e) {
      android.util.Log.w(LOG_TAG, "Could not persist the sign-in key: "
          + e.getMessage());
    }
  }

  private void deleteSavedToken() {
    try {
      tokenFile().delete();
    } catch (Exception e) {
      android.util.Log.w(LOG_TAG, "Could not remove the stored key: "
          + e.getMessage());
    }
  }

  // ---------------------------------------------------------------------
  // Small helpers

  private static String urlEncode(String value) {
    try {
      return URLEncoder.encode(value, "UTF-8");
    } catch (IOException e) {
      return value; // UTF-8 is always supported; unreachable.
    }
  }

  private static String modelOrDefault(String model, String fallback) {
    String trimmed = trimToEmpty(model);
    return trimmed.length() > 0 ? trimmed : fallback;
  }

  private static String trimToEmpty(String value) {
    return value == null ? "" : value.trim();
  }

  private static String safeString(String value) {
    return value == null ? "" : value;
  }

  private static void sleepQuietly(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  private static byte[] readAll(InputStream stream) throws IOException {
    BufferedInputStream in = new BufferedInputStream(stream);
    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    byte[] chunk = new byte[8192];
    int read;
    while ((read = in.read(chunk)) > 0) {
      buffer.write(chunk, 0, read);
    }
    return buffer.toByteArray();
  }

  private static void closeQuietly(OutputStream out) {
    if (out != null) {
      try {
        out.close();
      } catch (IOException e) {
        // Ignore close failures on output.
      }
    }
  }

  /** Builds the GotError message for an exception. */
  private static String exceptionMessage(Exception e) {
    if (e instanceof PollinationsException) {
      return e.getMessage();
    }
    String message = e.getMessage();
    if (message == null || message.length() == 0) {
      message = e.getClass().getSimpleName();
    }
    if (e instanceof java.net.SocketTimeoutException) {
      return "The request timed out - the service may be busy. Try again: " + message;
    }
    if (e instanceof IOException) {
      return "Network problem - check the internet connection: " + message;
    }
    return message;
  }

  /**
   * Builds a user-friendly error message from an HTTP response. The server's
   * own message ({"error":{"message":"..."}}) is used when present.
   */
  private static String friendlyHttpError(HttpResponse response, String fallback) {
    String serverMessage = extractServerMessage(response);
    StringBuilder message = new StringBuilder();
    if (serverMessage != null && serverMessage.length() > 0) {
      message.append(serverMessage);
    } else {
      message.append(fallback);
    }
    switch (response.code) {
      case 401:
        message.append(" (401: not signed in or an invalid key. Call SignIn or check "
            + "your key at enter.pollinations.ai/keys)");
        break;
      case 402:
        message.append(" (402: the Pollen balance is too low - top up or raise the "
            + "budget on the sign-in screen)");
        break;
      case 403:
        message.append(" (403: the key is not allowed to do this)");
        break;
      case 404:
        message.append(" (404: model or endpoint not found - check the model name "
            + "with ListModels)");
        break;
      case 429:
        message.append(" (429: rate limited - wait a moment and try again)");
        break;
      default:
        if (response.code >= 500) {
          message.append(" (").append(response.code)
              .append(": the service is having trouble - try again)");
        } else if (response.code != 200) {
          message.append(" (HTTP ").append(response.code).append(")");
        }
        break;
    }
    return message.toString();
  }

  /** Extracts {"error":{"message":...}} or {"message":...} from a body. */
  private static String extractServerMessage(HttpResponse response) {
    try {
      if (response.body == null || response.body.length == 0) {
        return null;
      }
      JSONObject body = new JSONObject(new String(response.body, "UTF-8"));
      JSONObject error = body.optJSONObject("error");
      if (error != null) {
        String message = error.optString("message", "");
        if (message.length() > 0) {
          return message;
        }
      }
      return body.optString("message", "");
    } catch (Exception e) {
      return null;
    }
  }
}
