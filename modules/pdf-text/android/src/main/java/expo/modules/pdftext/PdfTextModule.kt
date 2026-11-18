package expo.modules.pdftext

import android.content.Context
import android.net.Uri
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.text.PDFTextStripper
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Opens a (possibly password-protected) PDF on the phone and returns its text, so only
// text is sent to the Claude API. The password never leaves the device.
class PdfTextModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PdfText")

    AsyncFunction("extractText") { uri: String, password: String ->
      PDFBoxResourceLoader.init(context)
      val input = context.contentResolver.openInputStream(Uri.parse(uri))
        ?: throw CodedException("ERR_PDF_OPEN", "Could not open the PDF.", null)
      input.use { stream ->
        val doc = try {
          PDDocument.load(stream, password)
        } catch (e: InvalidPasswordException) {
          throw CodedException("ERR_PDF_PASSWORD", "This PDF needs a password.", e)
        }
        doc.use {
          val stripper = PDFTextStripper()
          stripper.setSortByPosition(true)
          mapOf("text" to stripper.getText(it), "pages" to it.numberOfPages)
        }
      }
    }
  }
}
