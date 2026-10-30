package expo.modules.smsreader

import android.content.Context
import android.net.Uri
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Reads recent inbox SMS so the JS side can parse bank alerts. Read-only; never sends or deletes.
class SmsReaderModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    AsyncFunction("readInbox") { sinceMs: Double, limit: Int ->
      val out = mutableListOf<Map<String, Any?>>()
      val cursor = context.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("_id", "address", "body", "date"),
        "date > ?",
        arrayOf(sinceMs.toLong().toString()),
        "date DESC"
      )
      cursor?.use {
        val idIdx = it.getColumnIndexOrThrow("_id")
        val addrIdx = it.getColumnIndexOrThrow("address")
        val bodyIdx = it.getColumnIndexOrThrow("body")
        val dateIdx = it.getColumnIndexOrThrow("date")
        while (it.moveToNext() && out.size < limit) {
          out.add(
            mapOf(
              "id" to it.getString(idIdx),
              "address" to it.getString(addrIdx),
              "body" to it.getString(bodyIdx),
              "date" to it.getLong(dateIdx).toDouble()
            )
          )
        }
      }
      out
    }
  }
}
