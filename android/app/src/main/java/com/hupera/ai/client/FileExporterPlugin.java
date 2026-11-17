package com.hupera.ai.client;

import android.content.ContentValues;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "FileExporter")
public class FileExporterPlugin extends Plugin {
    @PluginMethod
    public void saveFile(PluginCall call) {
        String fileName = safeFileName(call.getString("fileName", "hupera-report.bin"));
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String base64 = call.getString("base64", "");
        if (base64.isEmpty()) {
            call.reject("The report file is empty.");
            return;
        }
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            String location = writeToDownloads(fileName, mimeType, bytes);
            JSObject result = new JSObject();
            result.put("fileName", fileName);
            result.put("uri", location);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to save report: " + error.getMessage());
        }
    }

    @PluginMethod
    public void savePdf(PluginCall call) {
        String fileName = safeFileName(call.getString("fileName", "hupera-report.pdf"));
        String title = call.getString("title", "Hupera AI Report");
        String subtitle = call.getString("subtitle", "");
        JSONArray sections = call.getData().optJSONArray("sections");
        try {
            byte[] bytes = createPdf(title, subtitle, sections);
            String location = writeToDownloads(fileName, "application/pdf", bytes);
            JSObject result = new JSObject();
            result.put("fileName", fileName);
            result.put("uri", location);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to create PDF report: " + error.getMessage());
        }
    }

    private String safeFileName(String value) {
        String safe = value == null ? "hupera-report" : value.replaceAll("[^A-Za-z0-9._-]", "-");
        return safe.isEmpty() ? "hupera-report" : safe;
    }

    private String writeToDownloads(String fileName, String mimeType, byte[] bytes) throws Exception {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Hupera");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri uri = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new Exception("Android could not create the file in Downloads.");
            try (OutputStream output = context.getContentResolver().openOutputStream(uri)) {
                if (output == null) throw new Exception("Android could not open the report file.");
                output.write(bytes);
                output.flush();
            } catch (Exception error) {
                context.getContentResolver().delete(uri, null, null);
                throw error;
            }
            ContentValues complete = new ContentValues();
            complete.put(MediaStore.MediaColumns.IS_PENDING, 0);
            context.getContentResolver().update(uri, complete, null, null);
            return uri.toString();
        }
        File root = new File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Hupera");
        if (!root.exists() && !root.mkdirs()) throw new Exception("Could not create the report folder.");
        File outputFile = new File(root, fileName);
        try (FileOutputStream output = new FileOutputStream(outputFile)) {
            output.write(bytes);
            output.flush();
        }
        return outputFile.getAbsolutePath();
    }

    private byte[] createPdf(String title, String subtitle, JSONArray sections) throws Exception {
        List<String> lines = new ArrayList<>();
        if (sections != null) {
            for (int i = 0; i < sections.length(); i++) {
                JSONObject section = sections.optJSONObject(i);
                if (section == null) continue;
                lines.add("## " + section.optString("title", "Report"));
                JSONArray rows = section.optJSONArray("rows");
                if (rows == null || rows.length() == 0) {
                    lines.add("No data available");
                    continue;
                }
                for (int j = 0; j < rows.length(); j++) {
                    JSONObject row = rows.optJSONObject(j);
                    if (row == null) continue;
                    String label = row.optString("label", "");
                    String value = row.optString("value", "");
                    lines.add(label + " : " + value);
                }
                lines.add("");
            }
        }
        List<String> wrapped = new ArrayList<>();
        for (String line : lines) {
            if (line.isEmpty() || line.startsWith("## ")) {
                wrapped.add(line);
                continue;
            }
            String remaining = line;
            while (remaining.length() > 78) {
                int split = remaining.lastIndexOf(' ', 78);
                if (split < 20) split = 78;
                wrapped.add(remaining.substring(0, split));
                remaining = remaining.substring(split).trim();
            }
            wrapped.add(remaining);
        }

        PdfDocument document = new PdfDocument();
        int lineIndex = 0;
        int pageNumber = 1;
        do {
            PdfDocument.PageInfo info = new PdfDocument.PageInfo.Builder(595, 842, pageNumber).create();
            PdfDocument.Page page = document.startPage(info);
            Canvas canvas = page.getCanvas();
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setColor(Color.rgb(20, 48, 39));
            paint.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
            paint.setTextSize(pageNumber == 1 ? 22 : 16);
            canvas.drawText(title, 40, 48, paint);
            paint.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
            paint.setTextSize(10);
            paint.setColor(Color.rgb(94, 116, 106));
            canvas.drawText(subtitle, 40, 68, paint);
            canvas.drawLine(40, 82, 555, 82, paint);
            float y = 108;
            int count = 0;
            while (lineIndex < wrapped.size() && count < 31 && y < 790) {
                String line = wrapped.get(lineIndex++);
                if (line.startsWith("## ")) {
                    paint.setColor(Color.rgb(231, 243, 238));
                    canvas.drawRect(40, y - 16, 555, y + 7, paint);
                    paint.setColor(Color.rgb(18, 75, 57));
                    paint.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
                    paint.setTextSize(12);
                    canvas.drawText(line.substring(3), 48, y, paint);
                    paint.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
                    paint.setTextSize(10);
                } else {
                    paint.setColor(Color.rgb(40, 57, 50));
                    paint.setTextSize(10);
                    canvas.drawText(line, 48, y, paint);
                }
                y += 22;
                count++;
            }
            paint.setColor(Color.rgb(120, 135, 127));
            paint.setTextSize(9);
            canvas.drawText("Hupera AI · Page " + pageNumber, 455, 820, paint);
            document.finishPage(page);
            pageNumber++;
        } while (lineIndex < wrapped.size());
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        document.writeTo(output);
        document.close();
        return output.toByteArray();
    }
}
