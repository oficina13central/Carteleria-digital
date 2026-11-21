package com.carteleria.tvbox

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private var lastBackPressMs: Long = 0L
    private val mainHandler = Handler(Looper.getMainLooper())
    private var retryRunnable: Runnable? = null

    companion object {
        private const val PREFS_NAME = "carteleria_tvbox_prefs"
        private const val KEY_SAVED_URL = "saved_play_url"
        private const val DEFAULT_URL = "https://carteleria-digital.vercel.app/play"
        private const val BACK_EXIT_WINDOW_MS = 2500L
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        applyFullscreen()

        webView = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            isFocusable = true
            isFocusableInTouchMode = true

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                loadsImagesAutomatically = true
                mediaPlaybackRequiresUserGesture = false
                useWideViewPort = true
                loadWithOverviewMode = true
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            }

            CookieManager.getInstance().apply {
                setAcceptCookie(true)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    setAcceptThirdPartyCookies(this@apply, true)
                }
            }

            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean {
                    return false
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    if (url != null && url.contains("/play/")) {
                        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        prefs.edit().putString(KEY_SAVED_URL, url).apply()
                    }
                }

                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {
                    super.onReceivedError(view, request, error)
                    if (request?.isForMainFrame != true) return

                    val desc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        error?.description?.toString() ?: "Error de red"
                    } else {
                        "Error de conexión"
                    }

                    // Si ocurre ERR_CACHE_MISS, limpiar caché HTTP de WebView y reintentar
                    if (desc.contains("ERR_CACHE_MISS", ignoreCase = true)) {
                        view?.clearCache(true)
                    }

                    retryRunnable?.let { mainHandler.removeCallbacks(it) }
                    val runnable = Runnable {
                        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        val urlToLoad = prefs.getString(KEY_SAVED_URL, DEFAULT_URL) ?: DEFAULT_URL
                        view?.loadUrl(urlToLoad)
                    }
                    retryRunnable = runnable
                    mainHandler.postDelayed(runnable, 3500)
                }
            }
        }

        setContentView(webView)

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val startUrl = prefs.getString(KEY_SAVED_URL, DEFAULT_URL) ?: DEFAULT_URL
        webView.loadUrl(startUrl)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            applyFullscreen()
        }
    }

    @Suppress("DEPRECATION")
    private fun applyFullscreen() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.setDecorFitsSystemWindows(false)
                window.insetsController?.let { controller ->
                    controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                    controller.systemBarsBehavior =
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }
            } else {
                window.decorView.systemUiVisibility = (
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        or View.SYSTEM_UI_FLAG_FULLSCREEN
                    )
            }
        } catch (_: Exception) {
            // Ignorar si el dispositivo no soporta algún flag de pantalla completa
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            val now = System.currentTimeMillis()
            if (now - lastBackPressMs <= BACK_EXIT_WINDOW_MS) {
                finishAffinity()
            } else {
                lastBackPressMs = now
                Toast.makeText(
                    this,
                    "Presiona ATRÁS otra vez para cerrar",
                    Toast.LENGTH_SHORT
                ).show()
            }
            return true
        }

        if (keyCode == KeyEvent.KEYCODE_MENU) {
            showRemoteMenu()
            return true
        }

        return super.onKeyDown(keyCode, event)
    }

    private fun showRemoteMenu() {
        val options = arrayOf(
            "Recargar pantalla",
            "Limpiar caché y recargar",
            "Restablecer código de vinculación",
            "Cerrar aplicación"
        )

        AlertDialog.Builder(this)
            .setTitle("Vlenchu")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> webView.reload()
                    1 -> {
                        webView.clearCache(true)
                        webView.reload()
                    }
                    2 -> {
                        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        prefs.edit().remove(KEY_SAVED_URL).apply()
                        webView.evaluateJavascript("localStorage.removeItem('signage_device_code');", null)
                        webView.loadUrl(DEFAULT_URL)
                    }
                    3 -> finishAffinity()
                }
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    override fun onDestroy() {
        retryRunnable?.let { mainHandler.removeCallbacks(it) }
        webView.destroy()
        super.onDestroy()
    }
}
