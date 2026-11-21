# Reglas mínimas para WebView Kiosk
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
