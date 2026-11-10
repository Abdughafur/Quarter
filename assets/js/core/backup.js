import {
  createBackupData,
  inspectBackupData,
  verifyBackupIntegrity,
} from "./storage.js";

const MAX_BACKUP_SIZE = 25 * 1024 * 1024;

export async function downloadBackupFile() {
  const backup = await createBackupData();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `choryak-backup-${backup.exportedAt.slice(0, 10)}.json`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(reader.error || new Error("Could not read the backup file."));
    reader.onabort = () => reject(new Error("Reading the backup file was canceled."));
    reader.readAsText(file);
  });
}

export async function readBackupFile(file) {
  if (!file) throw new Error("Choose a backup JSON file first.");
  if (file.size > MAX_BACKUP_SIZE) {
    throw new Error("The backup file is too large (maximum 25 MB).");
  }
  const fileName = String(file.name || "").toLowerCase();
  const mimeType = String(file.type || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const hasJsonExtension = fileName.endsWith(".json");
  const isJsonMime =
    mimeType === "application/json" ||
    mimeType === "text/json" ||
    /^application\/[a-z0-9.+-]+\+json$/.test(mimeType);
  const isGenericMime =
    !mimeType || mimeType === "application/octet-stream";

  if ((!hasJsonExtension && !isJsonMime) || (!isJsonMime && !isGenericMime)) {
    throw new Error("Choose a JSON backup file.");
  }

  let backup;
  try {
    const text = (await readFileAsText(file)).replace(/^\uFEFF/, "");
    backup = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("The selected file is not valid JSON.", { cause: error });
    }
    throw error;
  }

  await verifyBackupIntegrity(backup);
  return {
    backup,
    summary: inspectBackupData(backup),
  };
}
