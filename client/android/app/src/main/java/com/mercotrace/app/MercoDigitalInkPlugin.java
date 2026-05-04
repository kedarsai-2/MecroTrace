package com.mercotrace.app;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.common.MlKitException;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.vision.digitalink.common.RecognitionCandidate;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognition;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModel;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModelIdentifier;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizer;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizerOptions;
import com.google.mlkit.vision.digitalink.recognition.Ink;
import com.google.mlkit.vision.digitalink.recognition.RecognitionContext;
import com.google.mlkit.vision.digitalink.recognition.WritingArea;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

@CapacitorPlugin(name = "MercoDigitalInk")
public class MercoDigitalInkPlugin extends Plugin {

    private static final String TAG = "MercoDigitalInk";
    private static final String DEFAULT_LANGUAGE_TAG = "en-IN";
    private static final int DEFAULT_MAX_RESULTS = 5;

    private final RemoteModelManager remoteModelManager = RemoteModelManager.getInstance();
    private final Map<String, DigitalInkRecognizer> recognizers = new HashMap<>();

    @PluginMethod
    public void prepare(PluginCall call) {
        final ModelBundle bundle;
        try {
            bundle = createModelBundle(languageTagFromCall(call));
        } catch (Exception e) {
            call.reject("Digital ink model is unavailable: " + e.getMessage(), e);
            return;
        }

        try {
            remoteModelManager.isModelDownloaded(bundle.model)
                .addOnSuccessListener(downloaded -> {
                    if (downloaded) {
                        call.resolve(readyResult(bundle.languageTag, true));
                        return;
                    }

                    try {
                        remoteModelManager.download(bundle.model, new DownloadConditions.Builder().build())
                            .addOnSuccessListener(unused -> call.resolve(readyResult(bundle.languageTag, true)))
                            .addOnFailureListener(e -> {
                                Log.w(TAG, "Model download failed for " + bundle.languageTag, e);
                                call.resolve(readyResult(bundle.languageTag, false));
                            });
                    } catch (Throwable e) {
                        Log.w(TAG, "Model download setup failed for " + bundle.languageTag, e);
                        call.resolve(readyResult(bundle.languageTag, false));
                    }
                })
                .addOnFailureListener(e -> {
                    Log.w(TAG, "Model readiness check failed for " + bundle.languageTag, e);
                    call.resolve(readyResult(bundle.languageTag, false));
                });
        } catch (Throwable e) {
            Log.w(TAG, "Model readiness setup failed for " + bundle.languageTag, e);
            call.resolve(readyResult(bundle.languageTag, false));
        }
    }

    @PluginMethod
    public void isReady(PluginCall call) {
        final ModelBundle bundle;
        try {
            bundle = createModelBundle(languageTagFromCall(call));
        } catch (Exception e) {
            call.reject("Digital ink model is unavailable: " + e.getMessage(), e);
            return;
        }

        try {
            remoteModelManager.isModelDownloaded(bundle.model)
                .addOnSuccessListener(downloaded -> call.resolve(readyResult(bundle.languageTag, downloaded)))
                .addOnFailureListener(e -> {
                    Log.w(TAG, "Model readiness check failed for " + bundle.languageTag, e);
                    call.resolve(readyResult(bundle.languageTag, false));
                });
        } catch (Throwable e) {
            Log.w(TAG, "Model readiness setup failed for " + bundle.languageTag, e);
            call.resolve(readyResult(bundle.languageTag, false));
        }
    }

    @PluginMethod
    public void recognize(PluginCall call) {
        final ModelBundle bundle;
        try {
            bundle = createModelBundle(languageTagFromCall(call));
        } catch (Exception e) {
            call.reject("Digital ink model is unavailable: " + e.getMessage(), e);
            return;
        }

        final JSObject data = call.getData();
        final JSONArray strokes = data.optJSONArray("strokes");
        final double canvasWidth = data.optDouble("canvasWidth", 0d);
        final double canvasHeight = data.optDouble("canvasHeight", 0d);
        final int maxResults = Math.max(1, Math.min(data.optInt("maxResults", DEFAULT_MAX_RESULTS), 10));

        Log.d(TAG, "Recognition requested for " + bundle.languageTag
            + " strokes=" + (strokes == null ? 0 : strokes.length())
            + " canvas=" + canvasWidth + "x" + canvasHeight);

        if (strokes == null || strokes.length() == 0) {
            call.reject("strokes are required");
            return;
        }
        if (canvasWidth <= 0 || canvasHeight <= 0) {
            call.reject("canvasWidth and canvasHeight are required");
            return;
        }

        final Ink ink;
        try {
            ink = buildInk(strokes);
        } catch (Exception e) {
            call.reject("Invalid stroke data: " + e.getMessage(), e);
            return;
        }

        try {
            remoteModelManager.isModelDownloaded(bundle.model)
                .addOnSuccessListener(downloaded -> {
                if (!downloaded) {
                    Log.i(TAG, "Model not downloaded for " + bundle.languageTag + "; starting warm-up and using JS fallback");
                    try {
                        warmModel(bundle.model, bundle.languageTag);
                    } catch (Throwable e) {
                        Log.w(TAG, "Model warm-up failed for " + bundle.languageTag, e);
                    }
                    call.reject("Digital ink model is not downloaded");
                    return;
                }

                try {
                    final long startNs = System.nanoTime();
                    DigitalInkRecognizer recognizer = recognizerFor(bundle);
                    RecognitionContext context = RecognitionContext.builder()
                        .setPreContext("")
                        .setWritingArea(new WritingArea((float) canvasWidth, (float) canvasHeight))
                        .build();

                    recognizer.recognize(ink, context)
                        .addOnSuccessListener(result -> {
                            try {
                                JSONArray candidates = new JSONArray();
                                for (RecognitionCandidate candidate : result.getCandidates()) {
                                    if (candidates.length() >= maxResults) break;
                                    candidates.put(candidate.getText());
                                }

                                long durationMs = Math.round((System.nanoTime() - startNs) / 1_000_000.0d);
                                JSObject ret = readyResult(bundle.languageTag, true);
                                ret.put("candidates", candidates);
                                ret.put("durationMs", durationMs);
                                ret.put("source", "mlkit");
                                Log.d(TAG, "Recognized " + candidates.length() + " candidates in " + durationMs + " ms");
                                call.resolve(ret);
                            } catch (Throwable e) {
                                Log.e(TAG, "Digital ink result handling failed", e);
                                rejectThrowable(call, "Digital ink result handling failed", e);
                            }
                        })
                        .addOnFailureListener(e -> call.reject("Digital ink recognition failed: " + e.getMessage(), e));
                } catch (Throwable e) {
                    Log.e(TAG, "Digital ink recognition setup failed", e);
                    rejectThrowable(call, "Digital ink recognition setup failed", e);
                }
            })
                .addOnFailureListener(e -> call.reject("Digital ink model readiness check failed: " + e.getMessage(), e));
        } catch (Throwable e) {
            Log.e(TAG, "Digital ink model readiness setup failed", e);
            rejectThrowable(call, "Digital ink model readiness setup failed", e);
        }
    }

    private String languageTagFromCall(PluginCall call) {
        String languageTag = call.getString("languageTag", DEFAULT_LANGUAGE_TAG);
        if (languageTag == null || languageTag.trim().isEmpty()) {
            return DEFAULT_LANGUAGE_TAG;
        }
        return languageTag.trim();
    }

    private ModelBundle createModelBundle(String requestedLanguageTag) throws MlKitException {
        DigitalInkRecognitionModelIdentifier identifier =
            DigitalInkRecognitionModelIdentifier.fromLanguageTag(requestedLanguageTag);
        if (identifier == null) {
            throw new MlKitException("No model for " + requestedLanguageTag, MlKitException.INVALID_ARGUMENT);
        }

        DigitalInkRecognitionModel model = DigitalInkRecognitionModel.builder(identifier).build();
        return new ModelBundle(identifier.getLanguageTag(), model);
    }

    private Ink buildInk(JSONArray strokes) {
        Ink.Builder inkBuilder = Ink.builder();
        long strokeTimeOffset = 0L;

        for (int i = 0; i < strokes.length(); i++) {
            JSONObject stroke = strokes.optJSONObject(i);
            if (stroke == null) continue;

            JSONArray xs = stroke.optJSONArray("xs");
            JSONArray ys = stroke.optJSONArray("ys");
            JSONArray ts = stroke.optJSONArray("ts");
            if (xs == null || ys == null || xs.length() == 0 || ys.length() == 0) continue;

            int pointCount = Math.min(xs.length(), ys.length());
            Ink.Stroke.Builder strokeBuilder = Ink.Stroke.builder();
            long lastT = 0L;
            for (int j = 0; j < pointCount; j++) {
                float x = (float) xs.optDouble(j);
                float y = (float) ys.optDouble(j);
                long t = ts != null && j < ts.length() ? Math.max(0L, ts.optLong(j)) : j;
                lastT = Math.max(lastT, t);
                strokeBuilder.addPoint(Ink.Point.create(x, y, strokeTimeOffset + t));
            }
            inkBuilder.addStroke(strokeBuilder.build());
            strokeTimeOffset += lastT + 1L;
        }

        if (inkBuilder.isEmpty()) {
            throw new IllegalArgumentException("No valid ink points");
        }

        return inkBuilder.build();
    }

    private DigitalInkRecognizer recognizerFor(ModelBundle bundle) {
        DigitalInkRecognizer existing = recognizers.get(bundle.languageTag);
        if (existing != null) {
            return existing;
        }

        DigitalInkRecognizer recognizer = DigitalInkRecognition.getClient(
            DigitalInkRecognizerOptions.builder(bundle.model).build()
        );
        recognizers.put(bundle.languageTag, recognizer);
        return recognizer;
    }

    private void warmModel(DigitalInkRecognitionModel model, String languageTag) {
        remoteModelManager.download(model, new DownloadConditions.Builder().build())
            .addOnSuccessListener(unused -> Log.i(TAG, "Model downloaded for " + languageTag))
            .addOnFailureListener(e -> Log.w(TAG, "Model download failed for " + languageTag, e));
    }

    private JSObject readyResult(String languageTag, boolean downloaded) {
        JSObject ret = new JSObject();
        ret.put("ready", downloaded);
        ret.put("downloaded", downloaded);
        ret.put("languageTag", languageTag);
        return ret;
    }

    private void rejectThrowable(PluginCall call, String message, Throwable throwable) {
        String detail = throwable.getMessage();
        Exception exception = throwable instanceof Exception
            ? (Exception) throwable
            : new Exception(throwable);
        call.reject(detail == null ? message : message + ": " + detail, exception);
    }

    private static class ModelBundle {
        final String languageTag;
        final DigitalInkRecognitionModel model;

        ModelBundle(String languageTag, DigitalInkRecognitionModel model) {
            this.languageTag = languageTag;
            this.model = model;
        }
    }
}
