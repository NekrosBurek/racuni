package rs.racuni.textscanner

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.view.MotionEvent
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.util.concurrent.TimeUnit

// In-app camera for paper receipts: preview, tap to focus, and a full-quality photo on demand.
class ReceiptCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true

  private val onFocus by EventDispatcher()
  private val onReady by EventDispatcher()

  private val previewView = PreviewView(context).apply {
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    scaleType = PreviewView.ScaleType.FILL_CENTER
  }
  private var provider: ProcessCameraProvider? = null
  private var camera: Camera? = null
  private var preview: Preview? = null
  private var imageCapture: ImageCapture? = null
  private var torch = false
  private var lastTapAt = 0L

  init {
    addView(previewView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    previewView.setOnTouchListener(::onTouch)
  }

  @SuppressLint("ClickableViewAccessibility")
  private fun onTouch(view: android.view.View, event: MotionEvent): Boolean {
    if (event.action == MotionEvent.ACTION_UP) {
      lastTapAt = System.currentTimeMillis()
      focusAt(event.x, event.y)
      val density = resources.displayMetrics.density
      onFocus(mapOf("x" to event.x / density, "y" to event.y / density))
    }
    return true
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    bind()
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    val useCases = listOfNotNull(preview, imageCapture).toTypedArray()
    if (useCases.isNotEmpty()) provider?.unbind(*useCases)
    camera = null
  }

  private fun bind() {
    val activity = appContext.currentActivity as? AppCompatActivity ?: return
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      if (!isAttachedToWindow) return@addListener
      try {
        val cameraProvider = future.get()
        val newPreview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
        val capture = ImageCapture.Builder()
          .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
          .build()
        // The QR camera unbinds everything when it binds; this screen only runs while that one is unmounted.
        cameraProvider.unbindAll()
        camera = cameraProvider.bindToLifecycle(activity, CameraSelector.DEFAULT_BACK_CAMERA, newPreview, capture)
        provider = cameraProvider
        preview = newPreview
        imageCapture = capture
        camera?.cameraControl?.enableTorch(torch)
        onReady(mapOf())
      } catch (e: Exception) {
        android.util.Log.e("ReceiptCamera", "Could not start the camera", e)
      }
    }, ContextCompat.getMainExecutor(context))
  }

  fun setTorch(on: Boolean) {
    torch = on
    camera?.cameraControl?.enableTorch(on)
  }

  private fun focusAt(x: Float, y: Float) = camera?.cameraControl?.startFocusAndMetering(
    FocusMeteringAction.Builder(
      previewView.meteringPointFactory.createPoint(x, y),
      FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE
    ).setAutoCancelDuration(5, TimeUnit.SECONDS).build()
  )

  // Focuses first (on the centre, unless the user just tapped somewhere), then takes the photo.
  fun takePicture(promise: Promise) {
    val capture = imageCapture
    if (capture == null) {
      promise.reject(CodedException("ERR_NOT_READY", "Kamera još nije spremna.", null))
      return
    }
    val shoot = {
      val file = File(context.cacheDir, "receipt-${System.currentTimeMillis()}.jpg")
      capture.takePicture(
        ImageCapture.OutputFileOptions.Builder(file).build(),
        ContextCompat.getMainExecutor(context),
        object : ImageCapture.OnImageSavedCallback {
          override fun onImageSaved(output: ImageCapture.OutputFileResults) {
            promise.resolve(Uri.fromFile(file).toString())
          }

          override fun onError(e: ImageCaptureException) {
            promise.reject(CodedException("ERR_CAPTURE", e.message, e))
          }
        }
      )
    }
    val focus = if (System.currentTimeMillis() - lastTapAt > 4000) {
      focusAt(previewView.width / 2f, previewView.height / 2f)
    } else {
      null
    }
    if (focus == null) shoot() else focus.addListener({ shoot() }, ContextCompat.getMainExecutor(context))
  }
}
