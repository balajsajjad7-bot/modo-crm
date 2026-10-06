package com.modo.crm;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * "Check order" inside the Modo app. Modo opens  modo://check?d=<order code>&u=<carrier order page>
 * and this screen loads the carrier's page (Verizon / AT&T / T-Mobile), types the order number and ZIP,
 * presses search, reads the status, and sends it back to Modo (which saves it on the sale).
 * The fill logic is the same script as the Modo Fill bookmark (assets/modofill.js).
 */
public class OrderCheckActivity extends Activity {
  private static final String MODO_HOST = "modo-crm1.vercel.app";
  private WebView web;
  private TextView status;
  private String code;
  private String fillJs = "";

  private static boolean carrierHost(String host) {
    if (host == null) return false;
    host = host.toLowerCase();
    return host.equals("verizon.com") || host.endsWith(".verizon.com") || host.equals("att.com") || host.endsWith(".att.com")
        || host.equals("t-mobile.com") || host.endsWith(".t-mobile.com") || host.equals("ups.com") || host.endsWith(".ups.com");
  }

  @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
  @Override
  protected void onCreate(Bundle saved) {
    super.onCreate(saved);
    Uri in = getIntent() != null ? getIntent().getData() : null;
    code = in != null ? in.getQueryParameter("d") : null;
    String url = in != null ? in.getQueryParameter("u") : null;
    // Only ever run for a real Modo order code and a carrier page.
    if (code == null || !code.matches("MODO1:[A-Za-z0-9+/=]{10,4000}") || url == null || !url.startsWith("https://") || !carrierHost(Uri.parse(url).getHost())) {
      finish();
      return;
    }
    try (InputStream is = getAssets().open("modofill.js")) {
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      byte[] b = new byte[8192]; int n;
      while ((n = is.read(b)) > 0) out.write(b, 0, n);
      fillJs = out.toString("UTF-8");
    } catch (Exception e) { fillJs = ""; }

    int dp = (int) getResources().getDisplayMetrics().density;
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(Color.parseColor("#07080f"));

    LinearLayout bar = new LinearLayout(this);
    bar.setOrientation(LinearLayout.HORIZONTAL);
    bar.setGravity(Gravity.CENTER_VERTICAL);
    bar.setPadding(14 * dp, 10 * dp, 8 * dp, 10 * dp);
    bar.setBackgroundColor(Color.parseColor("#10111e"));
    LinearLayout texts = new LinearLayout(this);
    texts.setOrientation(LinearLayout.VERTICAL);
    TextView title = new TextView(this);
    title.setText(code != null && url != null && url.contains("ups.com") ? "Modo · UPS tracking" : "Modo · Check order");
    title.setTextColor(Color.WHITE);
    title.setTypeface(Typeface.DEFAULT_BOLD);
    title.setTextSize(16);
    status = new TextView(this);
    status.setText("Opening the carrier page…");
    status.setTextColor(Color.parseColor("#a5f3fc"));
    status.setTextSize(12);
    texts.addView(title);
    texts.addView(status);
    bar.addView(texts, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
    Button close = new Button(this);
    close.setText("Close");
    close.setAllCaps(false);
    close.setOnClickListener(v -> finish());
    bar.addView(close);
    root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

    web = new WebView(this);
    WebSettings ws = web.getSettings();
    ws.setJavaScriptEnabled(true);
    ws.setDomStorageEnabled(true);
    ws.setSupportMultipleWindows(false);
    // Look like normal mobile Chrome (some sites treat the in-app "wv" browser differently).
    ws.setUserAgentString(ws.getUserAgentString().replace("; wv", ""));
    CookieManager.getInstance().setAcceptCookie(true);
    CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
    web.addJavascriptInterface(new Bridge(), "ModoApp");
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
        Uri u = req.getUrl();
        if (MODO_HOST.equalsIgnoreCase(u.getHost())) { openModo(u.toString()); return true; }
        String sch = u.getScheme();
        return sch == null || !(sch.equals("https") || sch.equals("http"));
      }
      @Override public void onPageFinished(WebView view, String url) {
        if (fillJs.isEmpty() || !carrierHost(Uri.parse(url).getHost())) return;
        status.setText(url.contains("ups.com") ? "Reading UPS…" : "Filling in the order details…");
        // Same script as the bookmark, with the order code passed in and auto-save on.
        String boot = "window.__MODO_CODE='" + code + "';window.__MODO_AUTO=1;"
            + "window.open=function(u){try{ModoApp.openModo(String(u))}catch(e){}return null};";
        view.evaluateJavascript(boot + "setTimeout(function(){" + fillJs + "},900);", null);
      }
    });
    root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
    setContentView(root);
    web.loadUrl(url);
  }

  /** Hand the result to the Modo app (the Trusted Web Activity), which saves it on the sale. */
  private void openModo(String url) {
    Uri u = Uri.parse(url);
    if (!MODO_HOST.equalsIgnoreCase(u.getHost())) return;
    Intent i = new Intent(Intent.ACTION_VIEW, u);
    i.setPackage(getPackageName());
    try { startActivity(i); } catch (Exception e) { startActivity(new Intent(Intent.ACTION_VIEW, u)); }
    finish();
  }

  private class Bridge {
    @JavascriptInterface public void openModo(String url) { runOnUiThread(() -> OrderCheckActivity.this.openModo(url)); }
  }

  @Override public void onBackPressed() {
    if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
  }

  @Override protected void onDestroy() {
    if (web != null) { ((ViewGroup) web.getParent()).removeView(web); web.destroy(); }
    super.onDestroy();
  }
}
