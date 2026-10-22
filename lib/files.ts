/** A picked file as base64, without the data: prefix. */
export async function fileToBase64(file: File): Promise<string> {
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return text.includes(",") ? text.slice(text.indexOf(",") + 1) : text;
}
