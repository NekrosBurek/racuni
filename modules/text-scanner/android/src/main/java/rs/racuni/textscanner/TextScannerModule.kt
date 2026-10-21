package rs.racuni.textscanner

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TextScannerModule : Module() {
  private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

  override fun definition() = ModuleDefinition {
    Name("TextScanner")

    // Every recognized line with its bounding box; JS rebuilds the printed rows from the positions.
    AsyncFunction("recognizeAsync") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject(CodedException("ERR_NO_CONTEXT", "React context is not available", null))
        return@AsyncFunction
      }
      val image = try {
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (e: Exception) {
        promise.reject(CodedException("ERR_IMAGE", e.message, e))
        return@AsyncFunction
      }
      recognizer.process(image)
        .addOnSuccessListener { text ->
          val lines = text.textBlocks.flatMap { block ->
            block.lines.map { line ->
              val box = line.boundingBox
              mapOf(
                "text" to line.text,
                "left" to (box?.left ?: 0),
                "top" to (box?.top ?: 0),
                "right" to (box?.right ?: 0),
                "bottom" to (box?.bottom ?: 0)
              )
            }
          }
          promise.resolve(lines)
        }
        .addOnFailureListener { e -> promise.reject(CodedException("ERR_RECOGNIZE", e.message, e)) }
    }
  }
}
