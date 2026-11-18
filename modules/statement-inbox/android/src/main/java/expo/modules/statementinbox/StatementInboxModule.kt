package expo.modules.statementinbox

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import com.sun.mail.imap.IMAPFolder
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.Date
import java.util.Properties
import javax.mail.AuthenticationFailedException
import javax.mail.Folder
import javax.mail.Multipart
import javax.mail.Part
import javax.mail.Session
import javax.mail.Store
import javax.mail.internet.MimeMessage
import javax.mail.search.AndTerm
import javax.mail.search.ComparisonTerm
import javax.mail.search.FromStringTerm
import javax.mail.search.OrTerm
import javax.mail.search.ReceivedDateTerm
import javax.mail.search.SearchTerm
import javax.mail.search.SubjectTerm

// Gets statement PDFs into the app two ways:
//  - fetchPdfs: reads Gmail over IMAP (read-only) with an app password, looking only at mail
//    from the given bank senders, and saves PDF attachments to the app's cache.
//  - Share sheet: a PDF shared to CardWise (ACTION_SEND) is copied to the cache and handed to JS.
class StatementInboxModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var pendingShare: Map<String, Any?>? = null

  override fun definition() = ModuleDefinition {
    Name("StatementInbox")
    Events("onSharedPdf")

    AsyncFunction("fetchPdfs") { email: String, appPassword: String, sinceMs: Double, senders: List<String>, subjectWord: String, skipIds: List<String>, maxMessages: Int ->
      val store = connect(email, appPassword)
      try {
        val folder = allMailFolder(store)
        folder.open(Folder.READ_ONLY)
        try {
          val fromTerms: Array<SearchTerm> = senders.map { FromStringTerm(it) }.toTypedArray()
          val terms = mutableListOf<SearchTerm>(
            ReceivedDateTerm(ComparisonTerm.GE, Date(sinceMs.toLong())),
            if (fromTerms.size == 1) fromTerms[0] else OrTerm(fromTerms)
          )
          if (subjectWord.isNotBlank()) terms.add(SubjectTerm(subjectWord))
          val term = AndTerm(terms.toTypedArray())
          val skip = skipIds.toSet()
          val out = mutableListOf<Map<String, Any?>>()
          val found = folder.search(term).sortedByDescending { it.receivedDate ?: Date(0) }.take(maxMessages)
          for (m in found) {
            val id = (m as? MimeMessage)?.messageID ?: "${m.receivedDate?.time}-${m.subject}"
            if (id in skip) continue
            val pdfs = mutableListOf<Part>()
            collectPdfs(m, pdfs)
            val base = mapOf(
              "id" to id,
              "from" to (m.from?.firstOrNull()?.toString() ?: ""),
              "subject" to (m.subject ?: ""),
              "date" to (m.receivedDate?.time ?: 0L).toDouble()
            )
            if (pdfs.isEmpty()) {
              out.add(base + mapOf("fileUri" to null, "filename" to null))
            }
            pdfs.forEachIndexed { i, p ->
              val f = File(context.cacheDir, "mail-${id.hashCode().toUInt()}-$i.pdf")
              p.inputStream.use { input -> f.outputStream().use { input.copyTo(it) } }
              out.add(base + mapOf("fileUri" to Uri.fromFile(f).toString(), "filename" to (p.fileName ?: "statement.pdf")))
            }
          }
          out
        } finally {
          folder.close(false)
        }
      } finally {
        store.close()
      }
    }

    AsyncFunction("testLogin") { email: String, appPassword: String ->
      connect(email, appPassword).close()
      true
    }

    // A PDF shared to the app while it was closed (the launch intent), consumed once.
    Function("takeSharedPdf") {
      if (pendingShare == null) {
        appContext.currentActivity?.intent?.let { intent ->
          pendingShare = readShare(intent)
          if (pendingShare != null) intent.action = null
        }
      }
      val s = pendingShare
      pendingShare = null
      s
    }

    OnNewIntent { intent ->
      readShare(intent)?.let {
        intent.action = null
        sendEvent("onSharedPdf", it)
      }
    }
  }

  private fun connect(email: String, appPassword: String): Store {
    val props = Properties().apply {
      put("mail.store.protocol", "imaps")
      put("mail.imaps.host", "imap.gmail.com")
      put("mail.imaps.port", "993")
      put("mail.imaps.ssl.enable", "true")
      put("mail.imaps.ssl.checkserveridentity", "true")
      put("mail.imaps.connectiontimeout", "20000")
      put("mail.imaps.timeout", "60000")
    }
    val store = Session.getInstance(props).getStore("imaps")
    try {
      store.connect("imap.gmail.com", email, appPassword.replace(" ", ""))
    } catch (e: AuthenticationFailedException) {
      throw CodedException("ERR_MAIL_AUTH", "Gmail rejected the email address or app password.", e)
    }
    return store
  }

  // Gmail's "All Mail" (statements are often archived); its name is localized, so find it by flag.
  private fun allMailFolder(store: Store): Folder {
    val all = store.defaultFolder.list("*").firstOrNull { f ->
      (f as? IMAPFolder)?.attributes?.any { it.equals("\\All", ignoreCase = true) } == true
    }
    return all ?: store.getFolder("INBOX")
  }

  private fun collectPdfs(part: Part, out: MutableList<Part>) {
    if (part.isMimeType("multipart/*")) {
      val mp = part.content as Multipart
      for (i in 0 until mp.count) collectPdfs(mp.getBodyPart(i), out)
      return
    }
    val name = part.fileName ?: ""
    if (part.isMimeType("application/pdf") || name.endsWith(".pdf", ignoreCase = true)) out.add(part)
  }

  private fun readShare(intent: Intent): Map<String, Any?>? {
    if (intent.action != Intent.ACTION_SEND) return null
    val uri: Uri = (if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
    }) ?: return null
    var name = "shared.pdf"
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
      if (c.moveToFirst()) c.getString(0)?.let { name = it }
    }
    val f = File(context.cacheDir, "shared-${System.currentTimeMillis()}.pdf")
    context.contentResolver.openInputStream(uri)?.use { input -> f.outputStream().use { input.copyTo(it) } } ?: return null
    return mapOf("fileUri" to Uri.fromFile(f).toString(), "filename" to name)
  }
}
