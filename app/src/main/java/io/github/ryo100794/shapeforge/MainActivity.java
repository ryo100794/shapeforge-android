package io.github.ryo100794.shapeforge;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int CREATE_DOCUMENT_REQUEST = 41;

    private WebView webView;
    private byte[] pendingBytes;
    private String pendingName;
    private String pendingMime;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.clearCache(true);
        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new Bridge(), "ShapeForge");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != CREATE_DOCUMENT_REQUEST || resultCode != RESULT_OK || data == null) {
            clearPendingExport();
            return;
        }
        Uri uri = data.getData();
        if (uri == null || pendingBytes == null) {
            clearPendingExport();
            return;
        }
        try (OutputStream out = getContentResolver().openOutputStream(uri)) {
            if (out == null) throw new IllegalStateException("Cannot open output stream");
            out.write(pendingBytes);
            toast("Saved " + pendingName);
        } catch (Exception e) {
            toast("Save failed: " + e.getMessage());
        } finally {
            clearPendingExport();
        }
    }

    private void clearPendingExport() {
        pendingBytes = null;
        pendingName = null;
        pendingMime = null;
    }

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_SHORT).show());
    }

    private final class Bridge {
        @JavascriptInterface
        public void saveFile(String fileName, String mimeType, String content) {
            pendingName = sanitizeFileName(fileName);
            pendingMime = mimeType == null || mimeType.isEmpty() ? "text/plain" : mimeType;
            pendingBytes = (content == null ? "" : content).getBytes(StandardCharsets.UTF_8);
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(pendingMime);
                intent.putExtra(Intent.EXTRA_TITLE, pendingName);
                startActivityForResult(intent, CREATE_DOCUMENT_REQUEST);
            });
        }

        @JavascriptInterface
        public void notify(String message) {
            toast(message == null ? "" : message);
        }

        private String sanitizeFileName(String value) {
            String name = value == null || value.trim().isEmpty() ? "model.stl" : value.trim();
            return name.replaceAll("[\\\\/:*?\"<>|]", "_");
        }
    }
}
