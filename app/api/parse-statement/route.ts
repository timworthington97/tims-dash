import path from "node:path";
import { pathToFileURL } from "node:url";
import { NextResponse } from "next/server";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseUbankPdfText } from "@/lib/importers/ubank-pdf";

pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No statement file was uploaded." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    let text = "";

    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      text += `${content.items.map((item) => ("str" in item ? item.str : "")).join("\n")}\n`;
    }

    const review = parseUbankPdfText(text, file.name);
    return NextResponse.json({ review });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "We could not read that PDF statement.",
      },
      { status: 400 },
    );
  }
}
